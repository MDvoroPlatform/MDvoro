import fs from 'node:fs';
import path from 'node:path';

const [sourceDir, outputDir] = process.argv.slice(2);
if (!sourceDir || !outputDir) throw new Error('Usage: node prepare-mdvoro-release.mjs <source-dir> <output-dir>');
const root = path.resolve(sourceDir);
const out = path.resolve(outputDir);
if (!fs.existsSync(path.join(root, 'app/page.tsx')) ||
    !fs.existsSync(path.join(root, 'app/scene.tsx')) ||
    !fs.existsSync(path.join(root, 'public/ATTRIBUTION.md'))) {
  throw new Error('The upstream anatomy source is incomplete; refusing to create a partial release.');
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(root, out, { recursive: true, filter: (src) => {
  const rel = path.relative(root, src).split(path.sep);
  return !rel.includes('.git') && !rel.includes('node_modules') && !rel.includes('dist');
}});

function replaceExactly(file, before, after, expected = 1) {
  const absolute = path.join(out, file);
  let text = fs.readFileSync(absolute, 'utf8');
  const count = text.split(before).length - 1;
  if (count !== expected) throw new Error(file + ': expected ' + expected + ' occurrence(s), found ' + count + ' for ' + JSON.stringify(before));
  text = text.replace(before, after);
  fs.writeFileSync(absolute, text);
}

// Critical fix: changing language must not reload 30–40 MB anatomy geometry.
replaceExactly(
  'app/page.tsx',
  "const [language,setLanguage]=useState<Language>('en');",
  "const [language,setLanguage]=useState<Language>('en');\n const languageRef=useRef(language);languageRef.current=language;"
);
replaceExactly(
  'app/page.tsx',
  "const source=edition_(sex,language);",
  "const [loadAttempt,setLoadAttempt]=useState(0);\n const source=edition_(sex,language);"
);
replaceExactly('app/page.tsx', "say(language,'catalogueError')", "say(languageRef.current,'catalogueError')");
replaceExactly('app/page.tsx', "},[sex,language]);", "},[sex,loadAttempt]);");
replaceExactly('app/page.tsx', "onClick={()=>location.reload()}", "onClick={()=>setLoadAttempt(n=>n+1)}");
replaceExactly(
  'app/page.tsx',
  "<span className=\"status-dot\"/> {t('eyebrow')}",
  "<span className=\"status-dot\"/> <span className=\"brand-word\">MDvoro</span><span className=\"brand-separator\">/</span>{t('eyebrow')}"
);
replaceExactly('app/i18n.ts', "title:{en:'Human Atlas',ar:'أطلس الجسم البشري'},", "title:{en:'Anatomy Lab',ar:'مختبر التشريح'},");
replaceExactly('app/i18n.ts', "eyebrow:{en:'INTERACTIVE ANATOMY',ar:'تشريح تفاعلي'},", "eyebrow:{en:'3D ANATOMY EXPLORER',ar:'مستكشف التشريح ثلاثي الأبعاد'},");
replaceExactly('app/i18n.ts', "reloadViewer:{en:'Reload viewer',ar:'إعادة تحميل العارض'},", "reloadViewer:{en:'Try loading again',ar:'إعادة المحاولة'}");

// Mobile WebGL tuning: reduce overdraw and request pressure on phones.
const sceneFile = 'app/scene.tsx';
replaceExactly(sceneFile, "new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'})", "new T.WebGLRenderer({antialias:innerWidth>=768,alpha:false,powerPreference:'high-performance'})");
replaceExactly(sceneFile, "Math.min(devicePixelRatio,innerWidth<768?1.5:2)", "Math.min(devicePixelRatio,innerWidth<768?1.25:1.85)");
replaceExactly(sceneFile, "Math.min(devicePixelRatio,el.clientWidth<768||el.clientHeight<600?1.5:2)", "Math.min(devicePixelRatio,el.clientWidth<768||el.clientHeight<600?1.25:1.85)");
replaceExactly(sceneFile, "Array.from({length:3},async()=>", "Array.from({length:el.clientWidth<768?2:3},async()=>");
replaceExactly(sceneFile, "renderer.setClearColor('#f2f3f3')", "renderer.setClearColor('#f5f8fc')");
replaceExactly(sceneFile, "color:0xd5d9dc,roughness:1", "color:0xe3ebf4,roughness:1");
replaceExactly(sceneFile, "color:0xeeeeec,metalness:.12,roughness:.67", "color:0xffffff,metalness:.08,roughness:.72");
replaceExactly(sceneFile, "color:0x8c969f,transparent:true,opacity:.4", "color:0x8ba6c5,transparent:true,opacity:.42");
replaceExactly(sceneFile, "color:0xa4aeb8,transparent:true,opacity:.16", "color:0xc5d4e6,transparent:true,opacity:.18");

replaceExactly('web/index.html', '<meta name="theme-color" content="#f3f4f4"/>', '<meta name="theme-color" content="#f5f8fc"/>');
replaceExactly(
  'web/index.html',
  '<meta name="description" content="An interactive atlas of the human body. Explore named anatomical structures, reveal organ systems, and inspect individual parts in 3D."/>',
  '<meta name="description" content="Explore human anatomy in 3D with MDvoro Anatomy Lab. Inspect structures, learn body systems, and study in English or Arabic."/>'
);
replaceExactly('web/index.html', '<title>Human Atlas</title>', '<title>MDvoro Anatomy Lab</title>');

const packagePath = path.join(out, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.name = 'mdvoro-anatomy-lab';
pkg.version = '1.0.0';
pkg.description = 'MDvoro Anatomy Lab — interactive 3D human anatomy learning environment';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
const lockPath = path.join(out, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.name = pkg.name;
lock.packages ||= {};
if (lock.packages['']) {
  lock.packages[''].name = pkg.name;
  lock.packages[''].version = pkg.version;
}
lock.version = pkg.version;
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

const css = [
'/* MDvoro brand layer: consistent tokens, hierarchy, and touch-friendly controls. */',
':root{--background:#f5f8fc;--foreground:#10233f;--card:#fff;--card-foreground:#10233f;--popover:#fff;--popover-foreground:#10233f;--primary:#1b73e8;--primary-foreground:#fff;--secondary:#eaf3ff;--secondary-foreground:#10233f;--muted:#eef3f8;--muted-foreground:#64748b;--accent:#eaf3ff;--accent-foreground:#10233f;--destructive:#b42318;--border:#e5ebf3;--input:#dbe5f0;--ring:#1b73e8;color-scheme:light}',
'html,body,#root,.studio{background:#f5f8fc;color:#10233f}',
'.glass{background:rgba(255,255,255,.94);border-color:#e5ebf3;box-shadow:0 14px 42px rgba(16,35,63,.07);backdrop-filter:blur(22px)}',
'.vignette{background:radial-gradient(ellipse at 50% 42%,transparent 39%,rgba(16,35,63,.045) 100%)}',
'.status-dot{background:#1b73e8;box-shadow:0 0 0 4px rgba(27,115,232,.10)}',
'.brand-word{color:#10233f;font-weight:800;letter-spacing:.035em}.brand-separator{color:#9aabc0;margin-inline:1px}',
'.identity h1{color:#10233f}.identity h1 .edition{color:#1b73e8;background:#eaf3ff;border-color:#d5e7ff}',
'.identity-meta{color:#64748b}.identity-meta span{color:#b5c2d1}',
'.top-actions button{color:#35506e;border-color:#e5ebf3;background:rgba(255,255,255,.9)}.top-actions button:hover{background:#eaf3ff;color:#0e4ea7}.top-actions .active{color:#0e4ea7;background:#eaf3ff;border-color:#cfe2ff}',
'.anatomy-choice [data-slot=select-trigger]{border-color:#dce6f1;color:#10233f;background:#fff}.anatomy-choice [data-slot=select-trigger]:focus-visible{outline:3px solid rgba(27,115,232,.22)}',
'.layers-panel{border-radius:16px}.panel-heading{color:#10233f}.panel-heading .small-number{background:#eaf3ff;color:#1b73e8}',
'.layer-presets{background:#f1f6fc}.layer-presets button{color:#64748b}.layer-presets button[aria-pressed=true]{color:#0e4ea7;background:#fff;box-shadow:0 1px 4px rgba(16,35,63,.1)}',
'.system-name{color:#7b8ca1}.system-row.enabled .system-name{color:#183b62}.system-count{color:#8597ad}.system-row [data-slot=switch]{--primary:#1b73e8}',
'.panel-foot{border-color:#e5ebf3;color:#64748b}.panel-foot button{color:#1b73e8}',
'.view-controls{border-radius:14px}.view-controls button{color:#64748b}.view-controls .active{background:#1b73e8;color:#fff;box-shadow:0 4px 12px rgba(27,115,232,.2)}',
'.bottom-dock{border-radius:16px;border-color:#e1eaf4}.explode-label,.explode-label output{color:#10233f}.explode-label output{background:#eaf3ff;border-color:#dbeafe}.explode-control [data-slot=slider-thumb]{background:#1b73e8;box-shadow:0 0 0 1px rgba(27,115,232,.28),0 3px 8px rgba(16,35,63,.16)}',
'.dock-reset,.dock-layers{color:#526b88}.dock-reset{border-color:#e5ebf3}.slider-endpoints{color:#8292a8}',
'.scene-caption{color:#71839a}.caption-line{background:#c8d6e6}.studio-footer{color:#8393a8}.studio-footer button{color:#1b73e8}',
'.loading{border-color:#dce6f1}.loading strong{color:#10233f}.loading span{color:#64748b}.loading-track{background:#eaf0f7}.loading-track i{background:#1b73e8}',
'.search-panel{border-radius:16px;border-color:#dce6f1}.search-panel [data-slot=input-group]{background:#f7faff;border-color:#dce6f1}.search-panel input{color:#10233f}.anatomy-search-results{border-color:#dce6f1!important;box-shadow:0 12px 32px rgba(16,35,63,.12)}',
'.detail-sheet{border-color:#dce6f1}.detail-accent{background:#1b73e8!important}.detail-header .eyebrow{color:#1b73e8}.structure-title{color:#10233f}.structure-description{color:#52657d!important}.structure-meta{border-color:#e5ebf3}.structure-meta strong{color:#183b62}',
'.primary-action{background:#1b73e8;color:#fff!important;border-color:#1b73e8;box-shadow:0 5px 14px rgba(27,115,232,.18)}.primary-action:hover,.primary-action.active{background:#0e4ea7;border-color:#0e4ea7}.secondary-action{color:#526b88}.source-link{color:#1b73e8}',
'.about-sheet{border-color:#dce6f1}.about-copy{color:#52657d}.about-copy strong,.about-copy h3{color:#10233f}.about-copy a{color:#1b73e8}',
'.part-hover{background:rgba(16,35,63,.96);box-shadow:0 8px 24px rgba(16,35,63,.2)}',
'button:focus-visible,a:focus-visible{outline:3px solid rgba(27,115,232,.45);outline-offset:3px}',
'@media(max-width:767px){.layers-panel.mobile-open,.detail-sheet{background:rgba(255,255,255,.98);border-color:#dce6f1;box-shadow:0 18px 55px rgba(16,35,63,.16)}.view-controls{box-shadow:0 8px 24px rgba(16,35,63,.11)}.bottom-dock{box-shadow:0 10px 32px rgba(16,35,63,.12)}.dock-layers{border-color:#e5ebf3}.system-row [data-slot=switch]{--primary:#1b73e8}}',
'@media(prefers-reduced-motion:reduce){.glass,button,.loading-track i{transition:none!important}}'
].join('\n');
fs.appendFileSync(path.join(out, 'app/globals.css'), '\n\n' + css + '\n');

const readme = [
'# MDvoro Anatomy Lab',
'',
'An interactive 3D anatomy learning environment for MDvoro. Explore adult male and female reference bodies, isolate individual structures, inspect anatomical systems, search in English or Arabic, and expand the body into a spatial inventory.',
'',
'## Run locally',
'',
'Requires Node.js 22.13 or newer.',
'',
'1. Install dependencies with npm ci.',
'2. Start the development server with npm run dev.',
'3. Open http://localhost:3016.',
'4. Run npm run check and npm run build to validate the app.',
'',
'## What was improved in this MDvoro edition',
'',
'- Rebranded the interface, page metadata, theme, controls, and documentation as MDvoro Anatomy Lab.',
'- Fixed a performance regression where changing English/Arabic re-fetched the anatomy manifest and remounted the 3D scene, forcing large geometry files to download again.',
'- Added an in-viewer retry path for catalog/model load errors instead of requiring a full page reload.',
'- Reduced mobile GPU pressure with a lower device pixel ratio, disabled MSAA on narrow screens, and fewer concurrent geometry downloads.',
'- Tuned the viewer surface and camera stage to MDvoro navy, blue, and light-surface colours.',
'- Preserved the original anatomical datasets and their source attribution.',
'',
'## Important educational scope',
'',
'This is an educational anatomy explorer, not a diagnostic, treatment, or surgical-planning tool. The two reference bodies come from different research projects; coverage and detail differ, and neither represents every human structure or variation.',
'',
'## Credits and licences',
'',
'- The original application code is distributed under the MIT License. The original copyright and licence notice are retained in LICENSE.',
'- The anatomy datasets have separate CC BY 4.0 attribution requirements. Keep public/ATTRIBUTION.md with every copy and deployment.',
'- BodyParts3D, Human Reference Atlas / HuBMAP, the Visible Human Project, Andreassen et al., and Wikidata are credited in the supplied attribution file.',
'- Third-party dependencies retain their own licences.',
'',
'The upstream project is slorksmo/Human-Atlas. This MDvoro edition is a modified derivative; preserve both the MIT notice and the dataset attributions when redistributing it.',
''
].join('\n');
fs.writeFileSync(path.join(out, 'README.md'), readme);

const notes = [
'# MDvoro Anatomy Lab — release notes',
'',
'- Branding and visual theme aligned with MDvoro.',
'- Language changes no longer reload anatomy geometry or remount the Three.js scene.',
'- Catalog failures can be retried from the current view.',
'- Mobile rendering defaults use a lower pixel ratio, no MSAA, and two concurrent anatomy chunk downloads.',
'- Original source code licence and anatomy-data attributions are preserved.',
'',
'Validation in the release workflow: TypeScript check, male and female atlas validation, interaction validation, and production build.',
''
].join('\n');
fs.writeFileSync(path.join(out, 'MDVORO-RELEASE-NOTES.md'), notes);
console.log('Prepared MDvoro Anatomy Lab at ' + out);
