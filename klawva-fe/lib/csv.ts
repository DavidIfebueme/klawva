import Papa from 'papaparse';

export type Product = Record<string, string>;

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function detectHeaders(rows: string[][]): { headers: string[]; dataRows: string[][] } {
  if (rows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const firstRow = rows[0];
  const looksLikeHeaders = firstRow.some((cell) => {
    const trimmed = cell.trim();
    return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed) && isNaN(Number(trimmed));
  });

  if (looksLikeHeaders) {
    return {
      headers: firstRow.map((h, i) => h.trim() || `column_${i + 1}`),
      dataRows: rows.slice(1),
    };
  }

  return {
    headers: firstRow.map((_, i) => `column_${i + 1}`),
    dataRows: rows,
  };
}

export function parseProductCSV(csvContent: string): Product[] {
  const cleanContent = stripBom(csvContent);
  const parseResult = Papa.parse<string[]>(cleanContent, { skipEmptyLines: true });

  if (parseResult.errors.length > 0) {
    const firstError = parseResult.errors[0];
    throw new Error(`CSV parse error on row ${firstError.row ?? '?'}: ${firstError.message}`);
  }

  const rows = parseResult.data as string[][];
  const { headers, dataRows } = detectHeaders(rows);

  return dataRows
    .map((row) => {
      const product: Product = {};
      headers.forEach((header, index) => {
        product[header] = row[index]?.trim() || '';
      });
      return product;
    })
    .filter((row) => Object.values(row).some((v) => v && v.trim()));
}

export function productsToPlainText(products: Product[]): string {
  return products
    .map((p, index) => {
      const fields = Object.entries(p)
        .filter(([_, value]) => value && value.trim())
        .map(([key, value]) => `${key}: ${value.trim()}`);
      return `${index + 1}. ${fields.join(' | ')}`;
    })
    .join('\n');
}
