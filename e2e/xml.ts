/**
 * Structural assertions on the produced file.
 *
 * The journey test used to check the XML with substring matches, which is
 * barely a check at all: `<Gender>F</Gender>` satisfies `toContain` no matter
 * which element it is nested under, or whether the document has one row or ten.
 *
 * This parses the file properly, and deliberately does so with a parser that
 * has nothing to do with the one that produced it. The app builds the XML by
 * string concatenation and the browser reads it back with DOMParser; using
 * Python's ElementTree here means a genuinely independent implementation has to
 * agree that the file is well-formed and shaped the way we claim.
 */

const PY = `
import json, sys, xml.etree.ElementTree as ET
tree = ET.parse(sys.argv[1])
root = tree.getroot()
rows = []
for node in root.findall('TouristCheckIn'):
    rows.append({
        'fields': {c.tag: (c.text or '') for c in node},
        'order': [c.tag for c in node],
    })
print(json.dumps({'root': root.tag, 'rows': rows}))
`;

export type ParsedFile = {
  root: string;
  rows: { fields: Record<string, string>; order: string[] }[];
};

/** Throws if the file is not well-formed, which is itself the assertion. */
export function parseCheckIns(path: string): ParsedFile {
  const proc = Bun.spawnSync(["python3", "-c", PY, path]);
  if (proc.exitCode !== 0) {
    throw new Error(`XML did not parse: ${new TextDecoder().decode(proc.stderr).trim()}`);
  }
  return JSON.parse(new TextDecoder().decode(proc.stdout)) as ParsedFile;
}
