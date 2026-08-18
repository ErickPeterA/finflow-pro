import { readFile } from "node:fs/promises";
import { parseBufferNibo, type ResultadoParse } from "../../lib/nibo";

export async function parseNiboExportFile(
  filePath: string,
  dataPadrao: string,
): Promise<ResultadoParse> {
  const buffer = await readFile(filePath);
  const copy = new Uint8Array(buffer).slice();
  return parseBufferNibo(copy.buffer, dataPadrao);
}
