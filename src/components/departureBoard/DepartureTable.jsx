import styles from "../BusStopDisplay.module.css";
import { t, tc } from "../../i18n";
import DepartureRow from "./DepartureRow";

// The departures themselves, as a table a screen reader can walk by column.
// Each row is keyed on the departure's lasting identity, so a refresh moves
// a row rather than remounting it and closing what the passenger opened.
function DepartureTable({ arrivals, rowKeys, ...rowProps }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
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
