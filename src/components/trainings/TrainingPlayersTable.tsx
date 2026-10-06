import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import AttendanceToggle from "@/components/trainings/AttendanceToggle";
import TrainingRatingInput from "@/components/trainings/TrainingRatingInput";
import type { AttendanceStatus } from "@/lib/attendance";
import { PLAYER_BUCKET_BADGE, type PlayerRow } from "@/lib/training-players";

interface Props {
  trainingId: string;
  rows: PlayerRow[];
  // True once the training has been played (confirmed + started): only then do the Attendance and
  // Rating columns exist.
  ratable: boolean;
  // Attendance or ratings failed to load: the table falls back to Player + Training only (the page
  // shows the failure message), so a missing value is never presented as an empty mark.
  controlsFailed?: boolean;
}

interface Marks {
  attendance: AttendanceStatus | null;
  rating: number | null;
}

const DASH = (
  <>
    <span aria-hidden="true" className="text-muted-foreground">
      —
    </span>
    <span className="sr-only">Not applicable</span>
  </>
);

// One table for the whole group of a training: player, training bucket, attendance and rating. A
// single island (not one per cell) because attendance drives the rating cell: marking a player absent
// disables their rating, marking them present again restores the server's rating. From `sm` up it is
// a real table; below that each row becomes a stacked card, so the controls never scroll sideways.
export default function TrainingPlayersTable({ trainingId, rows, ratable, controlsFailed = false }: Props) {
  const showControls = ratable && !controlsFailed;
  const [marks, setMarks] = useState<Record<string, Marks>>(() =>
    Object.fromEntries(rows.map((row) => [row.userId, { attendance: row.attendance, rating: row.rating }])),
  );

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-sm">No players yet.</p>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="block w-full text-sm sm:table">
        <caption className="sr-only">Players for this training</caption>
        <thead className="hidden sm:table-header-group">
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="px-3 py-2 font-medium">
              Player
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Training
            </th>
            {showControls && (
              <>
                <th scope="col" className="px-3 py-2 font-medium">
                  Attendance
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Rating
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {rows.map((row) => {
            const current = marks[row.userId] ?? { attendance: row.attendance, rating: row.rating };
            const badge = PLAYER_BUCKET_BADGE[row.bucket];
            const inMain = row.bucket === "main";
            const absent = current.attendance === "absent";
            return (
              <tr
                key={row.userId}
                className="block space-y-2 border-b px-3 py-3 last:border-b-0 sm:table-row sm:space-y-0 sm:px-0 sm:py-0"
              >
                <th scope="row" className="block text-left font-normal sm:table-cell sm:px-3 sm:py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                      {row.rank ?? ""}
                    </span>
                    <span className="min-w-0 font-medium break-words sm:font-normal">{row.label}</span>
                  </span>
                </th>
                <td className="block sm:table-cell sm:px-3 sm:py-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </td>
                {showControls && (
                  <>
                    <td className="flex items-center justify-between gap-3 sm:table-cell sm:px-3 sm:py-2">
                      <span className="text-muted-foreground text-xs sm:hidden">Attendance</span>
                      {inMain ? (
                        <AttendanceToggle
                          trainingId={trainingId}
                          userId={row.userId}
                          initialStatus={row.attendance}
                          playerLabel={row.label}
                          onSaved={(attendance, rating) => {
                            setMarks((prev) => ({ ...prev, [row.userId]: { attendance, rating } }));
                          }}
                        />
                      ) : (
                        DASH
                      )}
                    </td>
                    <td className="flex items-center justify-between gap-3 sm:table-cell sm:px-3 sm:py-2">
                      <span className="text-muted-foreground text-xs sm:hidden">Rating</span>
                      {inMain ? (
                        <TrainingRatingInput
                          // Remount when attendance flips so the input picks up the server's rating.
                          key={`${row.userId}:${absent ? "absent" : "rated"}:${current.rating ?? ""}`}
                          trainingId={trainingId}
                          userId={row.userId}
                          initialRating={current.rating}
                          playerLabel={row.label}
                          disabled={absent}
                        />
                      ) : (
                        DASH
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
