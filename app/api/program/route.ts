import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const program = await prisma.program.findFirst({
    where: { userId: 1, isActive: true },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          exercises: {
            orderBy: { displayOrder: "asc" },
            include: { exercise: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ program });
}
