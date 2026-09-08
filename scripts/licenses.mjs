import fs from 'node:fs/promises';
import path from 'node:path';
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
await fs.mkdir('LICENSES', { recursive: true });
const entries = [];
for (const [location, meta] of Object.entries(lock.packages)) {
  if (!location) continue;
  const name = location.slice(location.lastIndexOf('node_modules/') + 13);
  let pkg;
  try { pkg = JSON.parse(await fs.readFile(path.join(location, 'package.json'), 'utf8')); } catch { entries.push({ name, version: meta.version, license: meta.license || 'UNDECLARED', installed: false, development: !!meta.dev, files: [], repository: '' }); continue; }
  const target = `${name.replaceAll('/', '__').replaceAll('@', '')}-${pkg.version}`;
  const files = [];
  for (const file of await fs.readdir(location)) {
    if (!/^(licen[sc]e|copying|notice|third[-_]?party[-_]?notices?)(\.|$|-)/i.test(file)) continue;
    if (!(await fs.stat(path.join(location, file))).isFile()) continue;
    await fs.mkdir(path.join('LICENSES', target), { recursive: true });
    await fs.copyFile(path.join(location, file), path.join('LICENSES', target, file)); files.push(`LICENSES/${target}/${file}`);
  }
  if (!files.length && (pkg.name.startsWith('@esbuild/') || pkg.name.startsWith('@rolldown/binding-'))) {
    const parent = pkg.name.startsWith('@esbuild/') ? 'esbuild' : 'rolldown';
    for (const file of await fs.readdir(path.join('node_modules', parent))) {
      if (!/^(LICENSE|NOTICE)/i.test(file)) continue;
      const source = path.join('node_modules', parent, file);
      if (!(await fs.stat(source)).isFile()) continue;
      await fs.mkdir(path.join('LICENSES', target), { recursive: true });
      await fs.copyFile(source, path.join('LICENSES', target, file)); files.push(`LICENSES/${target}/${file}`);
    }
  }
  entries.push({ name: pkg.name, version: pkg.version, license: typeof pkg.license === 'object' ? pkg.license.type : pkg.license || meta.license || 'UNDECLARED', installed: true, development: !!meta.dev, files, repository: typeof pkg.repository === 'object' ? pkg.repository.url : pkg.repository || '' });
}
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
await fs.writeFile('LICENSES/inventory.json', JSON.stringify(entries, null, 2) + '\n');
const licenses = [...new Set(entries.map(e => e.license))].sort();
const missing = entries.filter(e => e.installed && !e.files.length);
const text = `# Third-party notices\n\nGenerated from package-lock.json and installed package contents by npm run licenses. Package versions are locked. Includes runtime and build dependencies; retaining the whole collection is the conservative distribution option.\n\nDeclared license expressions: ${licenses.join(', ')}.\n\n## Distribution notes\n\n- MIT and ISC: preserve copyright and permission notices with redistributed copies or substantial portions.\n- BSD-2-Clause and BSD-3-Clause: preserve copyright, conditions, and disclaimers; the three-clause license also restricts endorsement using contributor names.\n- Apache-2.0: include its license, preserve applicable attribution/NOTICE material, identify modifications to Apache-covered files, and observe its patent and trademark provisions.\n- MPL-2.0: Lightning CSS is a build dependency. If you redistribute its covered source or binaries, preserve its notices and make the covered source available under MPL, including modifications to those files. This file-level obligation does not automatically license separate Atlas files under MPL. Ordinary generated application output does not embed the Lightning CSS compiler. See [Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) and [the license](https://www.mozilla.org/en-US/MPL/2.0/).\n- Alternative license expressions such as (MIT OR Apache-2.0) offer a choice; retain the supplied notices and select applicable terms for a release.\n- CC0-1.0 is a public-domain dedication with fallback terms; retain supplied provenance.\n- React Flow core is MIT; no paid Pro examples or assets are included. PlantUML and draw.io code are not incorporated. Atlas implements its own documented syntax subset.\n- No external fonts, imagery, hosted services, or API keys are required at runtime.\n- Original Atlas code has not been assigned a public license (package metadata: UNLICENSED, private). Choose your own project license before public distribution. This does not change third-party obligations.\n- This inventory covers the installed platform. Optional packages absent on this platform are listed from the lockfile; regenerate notices after installation for each distribution target. Review actual shipped assets and the included license texts before release.\n\nPrimary license references: [MIT](https://opensource.org/license/mit), [ISC](https://opensource.org/license/isc-license-txt), [BSD-2-Clause](https://opensource.org/license/bsd-2-clause), [BSD-3-Clause](https://opensource.org/license/bsd-3-clause), [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), [CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en).\n\n## Installed packages without a standalone license file\n\n${missing.length ? missing.map(e => '- ' + e.name + '@' + e.version + ' — ' + e.license + '. See package metadata and upstream repository: ' + e.repository).join('\n') : 'None.'}\n\n## Dependency inventory\n\n| Package | Version | Declared license | Scope | Notices |\n| --- | --- | --- | --- | --- |\n${entries.map(e => `| ${e.name} | ${e.version} | ${e.license} | ${e.development ? 'Build / test' : 'Runtime'}${e.installed ? '' : '; optional, not installed'} | ${e.files.map(f => '[' + path.basename(f) + '](' + f + ')').join(', ') || 'See inventory metadata'} |`).join('\n')}\n`;
await fs.writeFile('THIRD_PARTY_NOTICES.md', text);
console.log(JSON.stringify({ packages: entries.length, installed: entries.filter(e => e.installed).length, licenses, missing: missing.map(e => ({ name: e.name, version: e.version, repository: e.repository })) }, null, 2));
