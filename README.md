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

## Getting started

1. Sign in. Accounts are invite only, so someone has to let you in.
2. Open **Profile** and upload a plan file. Copy `examples/TEMPLATE.yaml` and
   fill it in, or hand the template to your coach or chatbot and let them do it.
3. Go to the gym, open the day you're training, and log your sets.

If the upload complains, it will tell you exactly which line it didn't like.
Nothing is saved until the whole file is good, so your old plan stays put.
