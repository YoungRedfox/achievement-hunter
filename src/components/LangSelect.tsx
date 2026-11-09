import { LANGS, type Lang } from '../../shared/langs';

// Lista języków w ich własnych nazwach — każdy znajdzie swój bez znajomości angielskiego
export function LangSelect({ value, onChange, id }: { value: Lang; onChange: (l: Lang) => void; id?: string }) {
  return (
    <select id={id} className="lang-select" value={value} onChange={(e) => onChange(e.target.value as Lang)}>
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
