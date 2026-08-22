import { prisma } from "@/lib/prisma";
import type { Muscle, Prisma } from "@prisma/client";

/**
 * A user's exercise library.
 *
 * The library is the shared catalog **plus** the user's own additions **minus**
 * what they hid, with their overrides applied on top. It is assembled here and
 * nowhere else: before this, every read path queried `Exercise` directly, which
 * only worked while each account owned a private copy of everything.
 *
 * A row in `Exercise` exists only for exercises a user has actually engaged
 * with. `WorkoutLog` and `ProgramExercise` point at `Exercise.id`, so history
 * needs something durable to hang off - but a user who has never touched an
 * exercise needs no row for it, and copying 649 catalog entries into every
 * account at signup would go stale the moment a catalog entry was corrected.
 *
 * **One rule decides where an instantiated row's values come from:**
 *
 * - `name == null` - inherited. Every field comes from the catalog, so a
 *   catalog correction reaches the user with no per-user action.
 * - `name != null` - the user's own values win. Either a personal addition
 *   (`catalogSlug == null`) or a deliberate override, frozen on purpose.
 */

export interface LibraryEntry {
  /** Stable identity. A catalog slug, or `custom:<id>` for a personal addition. */
  slug: string;
  name: string;
  musclesPrimary: Muscle[];
  musclesSecondary: Muscle[];
  description: string;
  tips: string[];
  mistakes: string[];
  wikiUrl: string;
  videoUrl: string;
  /** Where the values came from, so callers can explain themselves to a user. */
  source: "catalog" | "override" | "personal";
  /** The user's row, once one exists. Null until the exercise is first used. */
  exerciseId: number | null;
}

type ExerciseRow = Prisma.ExerciseGetPayload<{ include: { catalog: true } }>;

/** Identity for a personal addition, which has no catalog slug to borrow. */
export function customSlug(exerciseId: number): string {
  return `custom:${exerciseId}`;
}

/**
 * Folds one of the user's rows into a library entry.
 *
 * Exported so a caller holding an `Exercise` (a log, a program slot) can render
 * it the same way the library does, rather than reading its columns raw and
 * getting nulls for every inherited field.
 */
export function entryForRow(row: ExerciseRow): LibraryEntry {
  if (row.name === null) {
    // Inherited. The catalog is the source of truth for every field.
    const c = row.catalog;
    return {
      slug: row.catalogSlug ?? customSlug(row.id),
      name: c?.name ?? "(unknown exercise)",
      musclesPrimary: c?.musclesPrimary ?? [],
      musclesSecondary: c?.musclesSecondary ?? [],
      description: c?.description ?? "",
      tips: c?.tips ?? [],
      mistakes: c?.mistakes ?? [],
      wikiUrl: c?.wikiUrl ?? "",
      videoUrl: c?.videoUrl ?? "",
      source: "catalog",
      exerciseId: row.id,
    };
  }

  return {
    slug: row.catalogSlug ?? customSlug(row.id),
    name: row.name,
    musclesPrimary: row.musclesPrimary,
    musclesSecondary: row.musclesSecondary,
    description: row.description,
    tips: row.tips,
    mistakes: row.mistakes,
    wikiUrl: row.wikiUrl,
    videoUrl: row.videoUrl,
    source: row.catalogSlug ? "override" : "personal",
    exerciseId: row.id,
  };
}

function entryForCatalog(c: {
  slug: string;
  name: string;
  musclesPrimary: Muscle[];
  musclesSecondary: Muscle[];
  description: string;
  tips: string[];
  mistakes: string[];
  videoUrl: string;
  wikiUrl: string;
}): LibraryEntry {
  return {
    slug: c.slug,
    name: c.name,
    musclesPrimary: c.musclesPrimary,
    musclesSecondary: c.musclesSecondary,
    description: c.description,
    tips: c.tips,
    mistakes: c.mistakes,
    wikiUrl: c.wikiUrl,
    videoUrl: c.videoUrl,
    source: "catalog",
    exerciseId: null,
  };
}

/**
 * The user's whole library, by name.
 *
 * Catalog entries the user has instantiated are represented by their own row -
 * that is what carries an override and, more importantly, the `exerciseId` a
 * caller needs to log against.
 */
export async function resolveLibrary(userId: number): Promise<LibraryEntry[]> {
  const [rows, catalog] = await Promise.all([
    prisma.exercise.findMany({ where: { userId }, include: { catalog: true } }),
    prisma.exerciseCatalog.findMany(),
  ]);

  const byCatalogSlug = new Map<string, ExerciseRow>();
  const personal: LibraryEntry[] = [];
  const hiddenSlugs = new Set<string>();

  for (const row of rows) {
    if (row.catalogSlug) {
      if (row.hidden) {
        hiddenSlugs.add(row.catalogSlug);
        continue;
      }
      byCatalogSlug.set(row.catalogSlug, row);
    } else if (!row.hidden) {
      personal.push(entryForRow(row));
    }
  }

  const fromCatalog = catalog
    .filter((c) => !hiddenSlugs.has(c.slug))
    .map((c) => {
      const row = byCatalogSlug.get(c.slug);
      return row ? entryForRow(row) : entryForCatalog(c);
    });

  return [...fromCatalog, ...personal].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * One library entry by its slug, or null if hidden or absent.
 *
 * Queried directly rather than by scanning `resolveLibrary`: assembling the
 * whole library means reading every catalog row, and a single lookup should not
 * pay for that. Upload and suggestion paths call this once per exercise.
 */
export async function findBySlug(
  userId: number,
  slug: string,
): Promise<LibraryEntry | null> {
  const row = await prisma.exercise.findUnique({
    where: { userId_catalogSlug: { userId, catalogSlug: slug } },
    include: { catalog: true },
  });
  if (row) {
    return row.hidden ? null : entryForRow(row);
  }

  const catalog = await prisma.exerciseCatalog.findUnique({ where: { slug } });
  return catalog ? entryForCatalog(catalog) : null;
}

/**
 * One library entry by name, case-insensitively, or null.
 *
 * The user's own rows are checked first, so an override or a personal addition
 * always beats a catalog entry of the same name. Queried directly for the same
 * reason as `findBySlug`.
 */
export async function findByName(
  userId: number,
  name: string,
): Promise<LibraryEntry | null> {
  const needle = name.trim();

  const own = await prisma.exercise.findFirst({
    where: {
      userId,
      hidden: false,
      name: { equals: needle, mode: "insensitive" },
    },
    include: { catalog: true },
  });
  if (own) {
    return entryForRow(own);
  }

  const catalog = await prisma.exerciseCatalog.findFirst({
    where: { name: { equals: needle, mode: "insensitive" } },
  });
  if (!catalog) {
    return null;
  }

  // The user may have instantiated or hidden this catalog entry. Their row
  // decides, and an inherited row still answers to the catalog's name.
  const row = await prisma.exercise.findUnique({
    where: { userId_catalogSlug: { userId, catalogSlug: catalog.slug } },
    include: { catalog: true },
  });
  if (row) {
    return row.hidden ? null : entryForRow(row);
  }

  return entryForCatalog(catalog);
}

/**
 * The `Exercise.id` for a library entry, creating the row if this is the first
 * time the user has used it.
 *
 * Called on the paths that need something durable to point at - programming an
 * exercise, logging a set. Reading the library never materialises anything, so
 * merely browsing does not litter an account with rows.
 *
 * The created row inherits: no values are copied, so a later catalog correction
 * still reaches it.
 */
export async function materialise(
  userId: number,
  slug: string,
): Promise<number> {
  const existing = await prisma.exercise.findUnique({
    where: { userId_catalogSlug: { userId, catalogSlug: slug } },
    select: { id: true, hidden: true },
  });
  if (existing) {
    // Using an exercise again is an implicit un-hide: the user just programmed
    // or logged it, which says more than the hide did.
    if (existing.hidden) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: { hidden: false },
      });
    }
    return existing.id;
  }

  const created = await prisma.exercise.create({
    data: { userId, catalogSlug: slug },
    select: { id: true },
  });
  return created.id;
}

/** Hides a catalog exercise for this user only. */
export async function hide(userId: number, slug: string): Promise<void> {
  await prisma.exercise.upsert({
    where: { userId_catalogSlug: { userId, catalogSlug: slug } },
    update: { hidden: true },
    create: { userId, catalogSlug: slug, hidden: true },
  });
}

/** Restores a hidden catalog exercise. */
export async function unhide(userId: number, slug: string): Promise<void> {
  await prisma.exercise.updateMany({
    where: { userId, catalogSlug: slug },
    data: { hidden: false },
  });
}

/**
 * Replaces a catalog entry's values for this user only.
 *
 * Writing `name` is what switches the row from inherited to overridden, so a
 * name is required even when only the muscles are being corrected - otherwise
 * the stored values would be silently ignored by the read rule.
 */
export async function override(
  userId: number,
  slug: string,
  values: {
    name: string;
    musclesPrimary?: Muscle[];
    musclesSecondary?: Muscle[];
    description?: string;
    tips?: string[];
    mistakes?: string[];
    videoUrl?: string;
  },
): Promise<number> {
  const catalog = await prisma.exerciseCatalog.findUnique({
    where: { slug },
  });
  if (!catalog) {
    throw new Error(`No catalog exercise "${slug}".`);
  }

  // Unspecified fields fall back to the catalog's values rather than to empty,
  // so overriding one field does not blank the rest.
  const data = {
    name: values.name,
    musclesPrimary: values.musclesPrimary ?? catalog.musclesPrimary,
    musclesSecondary: values.musclesSecondary ?? catalog.musclesSecondary,
    description: values.description ?? catalog.description,
    tips: values.tips ?? catalog.tips,
    mistakes: values.mistakes ?? catalog.mistakes,
    videoUrl: values.videoUrl ?? catalog.videoUrl,
    hidden: false,
  };

  const row = await prisma.exercise.upsert({
    where: { userId_catalogSlug: { userId, catalogSlug: slug } },
    update: data,
    create: { userId, catalogSlug: slug, ...data },
    select: { id: true },
  });
  return row.id;
}

/** Creates an exercise that exists only in this user's library. */
export async function addPersonal(
  userId: number,
  values: {
    name: string;
    musclesPrimary: Muscle[];
    musclesSecondary?: Muscle[];
    description?: string;
    videoUrl?: string;
  },
): Promise<number> {
  const row = await prisma.exercise.create({
    data: {
      userId,
      catalogSlug: null,
      name: values.name.trim(),
      musclesPrimary: values.musclesPrimary,
      musclesSecondary: values.musclesSecondary ?? [],
      description: values.description ?? "",
      videoUrl: values.videoUrl ?? "",
    },
    select: { id: true },
  });
  return row.id;
}
