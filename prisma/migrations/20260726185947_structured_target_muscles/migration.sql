/*
  Warnings:

  - You are about to drop the column `muscles` on the `Exercise` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Muscle" AS ENUM ('pec_major_clavicular', 'pec_major_sternal', 'lats', 'traps_upper', 'traps_middle', 'traps_lower', 'rhomboids', 'teres_major', 'erector_spinae', 'front_delt', 'side_delt', 'rear_delt', 'serratus_anterior', 'biceps_brachii', 'brachialis', 'triceps_brachii', 'brachioradialis', 'forearm_flexors', 'forearm_extensors', 'quadriceps', 'hamstrings', 'glute_max', 'glute_med', 'adductors', 'gastrocnemius', 'soleus', 'tibialis_anterior', 'rectus_abdominis', 'obliques', 'hip_flexors');

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "muscles",
ADD COLUMN     "musclesPrimary" "Muscle"[],
ADD COLUMN     "musclesSecondary" "Muscle"[];
