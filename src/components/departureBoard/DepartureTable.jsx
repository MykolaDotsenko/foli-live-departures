import styles from "../BusStopDisplay.module.css";
import { t, tc } from "../../i18n";
import DepartureRow from "./DepartureRow";

// The departures themselves, as a table a screen reader can walk by column.
// Each row is keyed on the departure's lasting identity, so a refresh moves
// a row rather than remounting it and closing what the passenger opened.
// With the times old (offline, or no update for two minutes) the countdowns
// lose the live colour: the notice above says why, and a bright "4 min"
// should not argue with it.
function DepartureTable({ arrivals, rowKeys, timesAreOld = false, ...rowProps }) {
  return (
    <div className={styles.tableWrap}>
      <table
        className={styles.table}
        data-times-old={timesAreOld ? "true" : undefined}
      >
        {/* Column widths live here: the visually hidden header row is still
            the row a fixed table layout takes them from, so widths on the
            cells were ignored and a 320px board split into equal thirds. */}
        <colgroup>
          <col className={styles.colLine} />
          <col />
          <col className={styles.colDue} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t("Line")}</th>
            <th scope="col">{t("Destination")}</th>
            <th scope="col">{tc("column", "Due")}</th>
          </tr>
        </thead>
        <tbody>
          {arrivals.map((arrival, index) => (
            <DepartureRow
              key={rowKeys[index]}
              arrival={arrival}
              rowKey={rowKeys[index]}
              {...rowProps}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DepartureTable;
