/** @jsxImportSource react */
import { Fragment, type ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";
import { recordStyles } from "./operator-record.styles";

/** Human-readable timestamps retain the exact provider value in semantic markup. */
export function OperatorMetadata({
  values,
  stackDates = false,
}: {
  values: readonly string[];
  stackDates?: boolean;
}): ReactElement {
  return (
    <>
      {values.map((value, index) => {
        const match =
          /^(.*?)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))$/.exec(
            value,
          );
        const timestamp = match?.[2];
        const date = timestamp ? new Date(timestamp) : null;
        return (
          <Fragment key={`${index}:${value}`}>
            {index > 0 ? (
              stackDates && date && Number.isFinite(date.getTime()) ? (
                <br />
              ) : (
                " · "
              )
            ) : (
              ""
            )}
            {date && timestamp && Number.isFinite(date.getTime()) ? (
              <>
                {match[1]}
                <time
                  {...stylex.props(recordStyles.timestamp)}
                  dateTime={timestamp}
                  title={timestamp}
                >
                  {new Intl.DateTimeFormat(undefined, {
                    year:
                      date.getFullYear() === new Date().getFullYear()
                        ? undefined
                        : "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short",
                  }).format(date)}
                </time>
              </>
            ) : (
              value
            )}
          </Fragment>
        );
      })}
    </>
  );
}
