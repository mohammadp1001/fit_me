# FitMe

## Why I built this

I started asking Claude to plan my workouts. That part worked great. The
problem was everything after.

I'd go to the gym, do the session, and then come back with nothing to tell it.
Was the weight too easy? Did my shoulder hurt again? Did I even hit the reps?
All of that lived in my head, or on a note somewhere, and by the time I sat
down to type it out I'd already forgotten half of it. So Claude was guessing.
The loop was broken.

FitMe closes that loop.

I log my sets at the gym, weight and reps, and a note if something felt off.
Then I turn on the connection, and Claude can pull that data straight from the
app. Real numbers, from my actual training. It looks at how the last few weeks
went and decides what to change. It talks it through with me first, and nothing
is saved until I approve it.

That's the whole idea.

## What you can ask it

> "What should I lift on chest day tomorrow?"
> "My shoulder has been sore for two weeks. Fix my plan."
> "Am I actually getting stronger?"

It answers from your own numbers, and it can write the answer back into the
app: the weights for your next session, or a whole new program.

### What the chatbot is allowed to do

Once connected, it gets 15 specific abilities and nothing more. Twelve of
them only read. Three can write, and none of those touch what you're
currently following.

**Reading your training**

| | |
|---|---|
| `get_progress_summary` | The usual starting point. Trends already worked out: body weight, weekly sets per muscle, and whether each lift is moving. |
| `get_exercise_history` | Every set you've logged for one lift, newest first. |
| `get_volume` | How many hard sets each muscle got, and whether that's low, about right, or a lot. |
| `list_sessions` | A skim-able list of recent workouts. |
| `get_session` | One workout in full, in the order you did it, including your notes. |
| `get_body_weight` | Your weigh-ins, and which way they're heading. |
| `get_coach_memory` | What it worked out about you in past conversations. |
| `list_programs` / `get_program` | Your plans, and one plan in detail. |
| `list_exercises` | The exercise library. |
| `get_program_schema` | The rules a plan file has to follow. |
| `validate_program_yaml` | Checks a draft plan for mistakes before showing it to you. Saves nothing. |

**Changing things**

| | |
|---|---|
| `save_suggestions` | The everyday one. Puts suggested weights on your log screen for next session. You're free to ignore them. |
| `save_program_draft` | Proposes a whole new plan. It waits as a draft. **Your current plan keeps running until you approve it in the app.** |
| `add_exercise` | Adds a movement the library doesn't have, to your library only. The shared catalog is never touched. |

**What it cannot do**

It can't log sets for you, switch your active plan, delete anything, or see
another person's data. There's deliberately no "just do it" option: a bad
suggestion costs you one session, but a bad plan costs you a month, so a
plan always stops and waits for you.

## Everything else

- **Upload a plan.** One file lists your days, your exercises, sets and reps.
  Start from `examples/TEMPLATE.yaml`, which explains every part of it.
- **Log your sets.** Weight and reps, set by set. Half kilos are fine.
- **Leave a note.** Anything worth remembering ("shoulder felt off", "easy,
  go heavier") gets saved with that exercise.
- **Workouts group themselves.** No start or stop button. Sets you log close
  together become one workout.
- **See your progress.** Charts for your body weight and for your best set on
  each exercise, plus how much work each muscle group got in the last week.
- **Look up any exercise.** The app knows about 676 exercises already, with the
  muscles they train, how to do them, common mistakes, and a video. You never
  have to type any of that in. Missing one? Add your own, just for you.
- **Keep several plans.** Switch between them; nothing you logged is lost.
- **Persian and English.** The whole interface, either way round, switchable
  any time.
- **Put it on your phone.** Add it to your home screen and it behaves like a
  normal app, even without signal.

## Where the exercise and muscle data comes from

You never type in what an exercise is. The app already knows.

**The exercise bank.** 676 exercises, shared by everyone and read-only.
Each one carries its name, the muscles it works, how to perform it, the
usual mistakes, and a video. Most of it comes from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public
domain), with 27 entries written by hand where the source was thin.

**Your own copy is thin on purpose.** The app doesn't hand you 676 rows
when you sign up. A row appears only for exercises you've actually used,
and it borrows everything from the bank rather than copying it. So when a
bank entry gets corrected, the fix reaches you without you doing
anything. You can still override an entry for yourself, hide one you'll
never do, or add a movement the bank is missing. Anything you add is
yours alone and never goes into the shared bank.

**Muscles come from a fixed list.** 30 of them, sorted into 11 everyday
groups (chest, back, shoulders, arms, forearms, quads, hamstrings,
glutes, adductors, calves, core). You can't invent a muscle name and
nothing accepts free text, which sounds fussy until you see what it
prevents: if "delts" and "shoulders" and "side delt" were all allowed,
your weekly numbers would be split across three spellings of the same
thing and quietly wrong.

The same reasoning is why a plan file carries no anatomy at all. It says
which exercise, how many sets, what reps. Nothing else. A plan used to be
able to re-label what a lift trains, which meant one careless file could
corrupt months of volume history. Now it simply can't.

**How the weekly numbers are worked out.** A set counts once toward each
muscle group it trains: fully if the exercise is a main mover for it,
half if it's a helper. A group is only counted once per set, at the
higher of the two, so an exercise doesn't score twice for being tagged in
detail. Only sets you actually completed count, so an empty set you
logged and never did adds nothing. The window is a rolling 7 days, and
the app flags a group as low under 10 sets and high over 20.

The full muscle list, with the group each one belongs to, is in
[`examples/MUSCLES.md`](examples/MUSCLES.md).

## Getting started

1. Sign in. Accounts are invite only, so someone has to let you in.
2. Open **Profile** and upload a plan file. Copy `examples/TEMPLATE.yaml` and
   fill it in, or hand the template to your coach or chatbot and let them do it.
3. Go to the gym, open the day you're training, and log your sets.

If the upload complains, it will tell you exactly which line it didn't like.
Nothing is saved until the whole file is good, so your old plan stays put.
