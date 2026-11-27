-- «Pendiente» pasa a ser «Esta semana»: no es un estado de avance sino la
-- selección de lo que se prioriza en la semana. RENAME VALUE (no DROP/CREATE):
-- es atómico y las filas que tuvieran 'pending' pasan a 'this_week' solas.
ALTER TYPE "public"."todo_status" RENAME VALUE 'pending' TO 'this_week';
