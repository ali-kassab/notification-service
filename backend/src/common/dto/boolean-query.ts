import { Transform } from 'class-transformer';

/** Parses "true"/"false" query-string values into booleans (anything else becomes undefined). */
export function BooleanQuery(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  });
}
