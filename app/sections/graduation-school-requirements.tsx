import { BookOpen, Info } from 'lucide-react';
import type { InfoRequirementTable } from '@/lib/data/info';

function RequirementText({ text }: { text: string }) {
  return <div className="school-requirement-text">{text.split(/\n+|\s+(?=\d+[.)]\s)/).filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>;
}

/** Reflow only the known flat track table; keep other school tables intact. */
export function SchoolRequirementTables({ tables }: { tables: InfoRequirementTable[] }) {
  return <div className="school-requirement-tables">{tables.map((table, i) => {
    const [head, ...rows] = table.rows;
    const trackCards = head?.length === 4 && head.every(cell => cell.header) &&
      /순번/.test(head[0].text) && /트랙|학과/.test(head[1].text) &&
      /졸업요건/.test(head[2].text) && /비고/.test(head[3].text) &&
      rows.length > 0 && rows.every(row => row.length === 4 && row.every(cell => !cell.header)) &&
      table.rows.every(row => row.every(cell => cell.colspan === 1 && cell.rowspan === 1));
    const title = table.heading || `졸업요건 ${i + 1}`;
    return <div className="school-requirement-table" key={i}>
      {trackCards ? <>
        <h4 className="school-requirement-group-title">{title}</h4>
        <div className="school-track-list">{rows.map((row, ri) => <article className="school-track" key={ri}>
          <header className="school-track-heading"><span className="school-track-index">{row[0].text}</span><h4>{row[1].text}</h4><span className="school-track-source">학교 수집 원문</span></header>
          <div className={`school-track-content${row[3].text.trim() ? ' has-note' : ''}`}>
            <div><h5><BookOpen size={14} aria-hidden="true" />{head[2].text}</h5><RequirementText text={row[2].text} /></div>
            {!!row[3].text.trim() && <aside className="school-track-note"><h5><Info size={14} aria-hidden="true" />{head[3].text}</h5><RequirementText text={row[3].text} /></aside>}
          </div>
        </article>)}</div>
      </> : (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll wide school tables.
        <section className="school-table-scroll" aria-label={`${title} 원문 표`} tabIndex={0}>
        <table className="school-original-table"><caption>{title}</caption><tbody>{table.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => cell.header ? <th key={ci} colSpan={cell.colspan} rowSpan={cell.rowspan}>{cell.text}</th> : <td key={ci} colSpan={cell.colspan} rowSpan={cell.rowspan}>{cell.text}</td>)}</tr>)}</tbody></table>
        </section>
      )}
    </div>;
  })}</div>;
}
