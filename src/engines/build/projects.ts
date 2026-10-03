/**
 * Klopa projects for the L08 lab: Dockerfile card catalogues, build contexts and presets.
 * Sizes and times are illustrative (labelled „ilustrativno” in the UI) and come from the L08 model.
 */
import type { ContextFile, Instruction, SecretValue } from './image.ts'

export type ProjectId = 'klopa-web' | 'klopa-api'

export type LabPresetId =
  /** Hook: Iva's first Dockerfile – full node base, no .dockerignore, COPY . . before npm ci, root */
  | 'ivin-prvi'
  /** Flagship start: all build cards, COPY . . before npm ci, no .dockerignore, single stage, USER in the tray */
  | 'laboratorij'
  /** COPY . . before npm ci (with .dockerignore) */
  | 'los-redoslijed'
  /** COPY package*.json → npm ci → COPY . . → build, single stage, USER node */
  | 'dobar-redoslijed'
  /** Good order + multi-stage (node build → nginx-unprivileged runtime) */
  | 'visefazna'
  /** klopa-api: COPY . . before pip install, gunicorn on its default 127.0.0.1 */
  | 'api-los'
  /** klopa-api: requirements first, USER, gunicorn --bind 0.0.0.0:8000 */
  | 'api-dobar'

export interface LabPreset {
  project: ProjectId
  cards: string[]
  dockerignore: boolean
  multiStage: boolean
  baseVariant: 'slim' | 'full'
  note: string
}

export interface ProjectSpec {
  id: ProjectId
  /** Image repository in registry.klopa.example */
  repo: string
  title: string
  files: ContextFile[]
  catalog: Record<string, Instruction>
  /** Paths „Promijeni kod” bumps */
  codePaths: string[]
  /** Paths „Promijeni ovisnosti” bumps */
  depsPaths: string[]
  /** Cards that exist only in the single-stage / multi-stage form, by slot */
  slots: { user: { single: string; multi: string }; cmd: { single: string; multi: string } } | null
  /** Runtime-stage cards added by the multi-stage toggle (in order) */
  multiStageCards: string[]
  /** Base card variants */
  baseCard: string
  baseVariants: { slim: string; full: string }
  /** Cards inserted by the break-it button „Kopiraj .env pa ga obriši” */
  envTrick: [string, string]
  /** `USER root` card the break-it puts in front when the stage runs as a non-root user (nginx-unprivileged: UID 101) */
  userRootCard: string
  /**
   * What a working image of this project must contain: one of these (CMD program, paths in the merged view).
   * Used by the „< 5 s”, „< 200 MB” and „nije root” tasks, so a Dockerfile that never copies the app cannot pass.
   */
  app: { cmd: string; needs: string[] }[]
  /** CMD variants by listen address (`setListenAddr`), or null when the project has only one */
  listenVariants: { '0.0.0.0': string; '127.0.0.1': string } | null
  /** Private npm package behind a token (the build-time-secret scene): klopa-web only */
  npmToken: boolean
  defaultPreset: LabPresetId
}

/** Fictional SMS-gateway key that ends up in images (used by „Pronađite ključ u slici”). */
export const SMS_SECRET: SecretValue = { name: 'SMS_API_KEY', value: 'klopa-sms-7f3a9c2e51d8' }
/** Fictional npm token for the build-time secret scene. */
export const NPM_SECRET: SecretValue = { name: 'NPM_TOKEN', value: 'npm_k1Op4Pr1v4t3T0k3n' }

const web: ProjectSpec = {
  id: 'klopa-web',
  repo: 'klopa-web',
  title: 'klopa-web (TypeScript, npm, Vite)',
  files: [
    { path: 'package.json', sizeMB: 0.01, ratio: 0.3, version: 1, role: 'deps', ignored: false },
    { path: 'package-lock.json', sizeMB: 0.49, ratio: 0.25, version: 1, role: 'deps', ignored: false },
    { path: 'src/', sizeMB: 4, ratio: 0.3, version: 1, role: 'code', ignored: false },
    { path: 'public/', sizeMB: 5.97, ratio: 0.9, version: 1, role: 'asset', ignored: false },
    { path: 'index.html', sizeMB: 0.01, ratio: 0.5, version: 1, role: 'code', ignored: false },
    { path: 'vite.config.ts', sizeMB: 0.01, ratio: 0.5, version: 1, role: 'config', ignored: false },
    { path: 'tsconfig.json', sizeMB: 0.01, ratio: 0.5, version: 1, role: 'config', ignored: false },
    { path: 'node_modules/', sizeMB: 180, ratio: 0.3, version: 1, role: 'local-deps', ignored: true, devDepsMB: 120 },
    { path: '.git/', sizeMB: 220, ratio: 0.95, version: 1, role: 'vcs', ignored: true },
    { path: '.env', sizeMB: 0.001, ratio: 1, version: 1, role: 'secret', ignored: true, secret: SMS_SECRET },
  ],
  catalog: {
    'from-build': { id: 'from-build', kind: 'FROM', text: 'FROM node:24-slim AS build', base: 'node:24-slim', as: 'build' },
    'from-build-full': { id: 'from-build-full', kind: 'FROM', text: 'FROM node:24 AS build', base: 'node:24', as: 'build' },
    workdir: { id: 'workdir', kind: 'WORKDIR', text: 'WORKDIR /app' },
    'copy-pkg': { id: 'copy-pkg', kind: 'COPY', text: 'COPY package*.json ./', src: ['package*.json'], dest: './' },
    'npm-ci': { id: 'npm-ci', kind: 'RUN', text: 'RUN npm ci', action: 'npm-ci' },
    // Only runtime dependencies (−120 MB) – then `npm run build` cannot find Vite: why the build needs its own stage
    'npm-ci-omit-dev': { id: 'npm-ci-omit-dev', kind: 'RUN', text: 'RUN npm ci --omit=dev', action: 'npm-ci-prod' },
    'copy-all': { id: 'copy-all', kind: 'COPY', text: 'COPY . .', src: ['.'], dest: '.' },
    'npm-build': { id: 'npm-build', kind: 'RUN', text: 'RUN npm run build', action: 'npm-build' },
    'user-node': { id: 'user-node', kind: 'USER', text: 'USER node', user: 'node' },
    'cmd-node': { id: 'cmd-node', kind: 'CMD', text: 'CMD ["npm", "start"]', listen: { addr: '0.0.0.0', port: 8080 } },
    'from-runtime': {
      id: 'from-runtime',
      kind: 'FROM',
      text: 'FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime',
      base: 'nginxinc/nginx-unprivileged:1.30-alpine',
      as: 'runtime',
    },
    'copy-dist': {
      id: 'copy-dist',
      kind: 'COPY',
      text: 'COPY --from=build /app/dist /usr/share/nginx/html',
      from: 'build',
      fromPath: 'dist/',
      dest: '/usr/share/nginx/html/',
    },
    'user-nginx': { id: 'user-nginx', kind: 'USER', text: 'USER 101', user: '101' },
    'user-root': { id: 'user-root', kind: 'USER', text: 'USER root', user: 'root' },
    'cmd-nginx': { id: 'cmd-nginx', kind: 'CMD', text: 'CMD ["nginx", "-g", "daemon off;"]', listen: { addr: '0.0.0.0', port: 8080 } },
    // „Tajna u sloju”
    'copy-env': { id: 'copy-env', kind: 'COPY', text: 'COPY .env .', src: ['.env'], dest: '.' },
    'rm-env': { id: 'rm-env', kind: 'RUN', text: 'RUN rm .env', action: 'rm', target: '.env' },
    'env-secret': { id: 'env-secret', kind: 'ENV', text: `ENV ${SMS_SECRET.name}=${SMS_SECRET.value}`, name: SMS_SECRET.name, value: SMS_SECRET.value, secret: true },
    'copy-npmrc': { id: 'copy-npmrc', kind: 'COPY', text: 'COPY .npmrc ./', src: ['.npmrc'], dest: './' },
    'rm-npmrc': { id: 'rm-npmrc', kind: 'RUN', text: 'RUN rm .npmrc', action: 'rm', target: '.npmrc' },
    'arg-npm-token': { id: 'arg-npm-token', kind: 'ARG', text: 'ARG NPM_TOKEN', name: 'NPM_TOKEN', secret: true },
    'npm-ci-arg': { id: 'npm-ci-arg', kind: 'RUN', text: 'RUN npm ci', action: 'npm-ci', usesArgs: ['NPM_TOKEN'] },
    'npm-ci-secret': {
      id: 'npm-ci-secret',
      kind: 'RUN',
      text: 'RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci',
      action: 'npm-ci',
      secretMounts: ['npmrc'],
    },
  },
  codePaths: ['src/'],
  depsPaths: ['package.json', 'package-lock.json'],
  slots: { user: { single: 'user-node', multi: 'user-nginx' }, cmd: { single: 'cmd-node', multi: 'cmd-nginx' } },
  multiStageCards: ['from-runtime', 'copy-dist'],
  baseCard: 'from-build',
  baseVariants: { slim: 'from-build', full: 'from-build-full' },
  envTrick: ['copy-env', 'rm-env'],
  userRootCard: 'user-root',
  app: [
    // multi-stage: nginx serves the built files
    { cmd: 'nginx', needs: ['dist/'] },
    // single stage: `npm start` (vite preview) needs the build output and the dependencies
    { cmd: 'npm', needs: ['dist/', 'node_modules/', 'package.json'] },
  ],
  listenVariants: null,
  npmToken: true,
  defaultPreset: 'laboratorij',
}

const api: ProjectSpec = {
  id: 'klopa-api',
  repo: 'klopa-api',
  title: 'klopa-api (Python, Django, gunicorn)',
  files: [
    { path: 'requirements.txt', sizeMB: 0.01, ratio: 0.3, version: 1, role: 'deps', ignored: false },
    { path: 'klopa/', sizeMB: 3, ratio: 0.3, version: 1, role: 'code', ignored: false },
    { path: 'manage.py', sizeMB: 0.01, ratio: 0.5, version: 1, role: 'code', ignored: false },
    { path: '.venv/', sizeMB: 150, ratio: 0.35, version: 1, role: 'local-deps', ignored: true },
    { path: '.git/', sizeMB: 120, ratio: 0.95, version: 1, role: 'vcs', ignored: true },
    { path: '.env', sizeMB: 0.001, ratio: 1, version: 1, role: 'secret', ignored: true, secret: SMS_SECRET },
  ],
  catalog: {
    'api-from': { id: 'api-from', kind: 'FROM', text: 'FROM python:3.13-slim', base: 'python:3.13-slim' },
    'api-workdir': { id: 'api-workdir', kind: 'WORKDIR', text: 'WORKDIR /app' },
    'api-copy-req': { id: 'api-copy-req', kind: 'COPY', text: 'COPY requirements.txt .', src: ['requirements.txt'], dest: '.' },
    'api-pip': { id: 'api-pip', kind: 'RUN', text: 'RUN pip install --no-cache-dir -r requirements.txt', action: 'pip-install' },
    'api-copy-all': { id: 'api-copy-all', kind: 'COPY', text: 'COPY . .', src: ['.'], dest: '.' },
    'api-user': { id: 'api-user', kind: 'USER', text: 'USER 10001', user: '10001' },
    'api-expose': { id: 'api-expose', kind: 'EXPOSE', text: 'EXPOSE 8000', port: 8000 },
    'api-cmd': {
      id: 'api-cmd',
      kind: 'CMD',
      text: 'CMD ["gunicorn", "--bind", "0.0.0.0:8000", "klopa.wsgi"]',
      listen: { addr: '0.0.0.0', port: 8000 },
    },
    // gunicorn's default bind is 127.0.0.1:8000 – unreachable through a published port
    'api-cmd-local': { id: 'api-cmd-local', kind: 'CMD', text: 'CMD ["gunicorn", "klopa.wsgi"]', listen: { addr: '127.0.0.1', port: 8000 } },
    'api-copy-env': { id: 'api-copy-env', kind: 'COPY', text: 'COPY .env .', src: ['.env'], dest: '.' },
    'api-rm-env': { id: 'api-rm-env', kind: 'RUN', text: 'RUN rm .env', action: 'rm', target: '.env' },
    'api-user-root': { id: 'api-user-root', kind: 'USER', text: 'USER root', user: 'root' },
  },
  codePaths: ['klopa/', 'manage.py'],
  depsPaths: ['requirements.txt'],
  slots: null,
  multiStageCards: [],
  baseCard: 'api-from',
  baseVariants: { slim: 'api-from', full: 'api-from' },
  envTrick: ['api-copy-env', 'api-rm-env'],
  userRootCard: 'api-user-root',
  app: [{ cmd: 'gunicorn', needs: ['klopa/', 'site-packages/'] }],
  listenVariants: { '0.0.0.0': 'api-cmd', '127.0.0.1': 'api-cmd-local' },
  npmToken: false,
  defaultPreset: 'api-dobar',
}

export const PROJECTS: Record<ProjectId, ProjectSpec> = { 'klopa-web': web, 'klopa-api': api }

export const LAB_PRESETS: Record<LabPresetId, LabPreset> = {
  'ivin-prvi': {
    project: 'klopa-web',
    cards: ['from-build-full', 'workdir', 'copy-all', 'npm-ci', 'npm-build', 'cmd-node'],
    dockerignore: false,
    multiStage: false,
    baseVariant: 'full',
    note: 'Ivin prvi Dockerfile: puna bazna slika, bez .dockerignore, COPY . . prije npm ci, radi kao root',
  },
  laboratorij: {
    project: 'klopa-web',
    cards: ['from-build', 'workdir', 'copy-pkg', 'copy-all', 'npm-ci', 'npm-build', 'cmd-node'],
    dockerignore: false,
    multiStage: false,
    baseVariant: 'slim',
    note: 'početak laboratorija: COPY . . prije npm ci, bez .dockerignore, jedna faza',
  },
  'los-redoslijed': {
    project: 'klopa-web',
    cards: ['from-build', 'workdir', 'copy-all', 'npm-ci', 'npm-build', 'user-node', 'cmd-node'],
    dockerignore: true,
    multiStage: false,
    baseVariant: 'slim',
    note: 'COPY . . prije npm ci',
  },
  'dobar-redoslijed': {
    project: 'klopa-web',
    cards: ['from-build', 'workdir', 'copy-pkg', 'npm-ci', 'copy-all', 'npm-build', 'user-node', 'cmd-node'],
    dockerignore: true,
    multiStage: false,
    baseVariant: 'slim',
    note: 'od najrjeđe do najčešće promjene',
  },
  visefazna: {
    project: 'klopa-web',
    cards: ['from-build', 'workdir', 'copy-pkg', 'npm-ci', 'copy-all', 'npm-build', 'from-runtime', 'copy-dist', 'user-nginx', 'cmd-nginx'],
    dockerignore: true,
    multiStage: true,
    baseVariant: 'slim',
    note: 'dobar redoslijed + višefazna izgradnja (node → nginx-unprivileged)',
  },
  'api-los': {
    project: 'klopa-api',
    cards: ['api-from', 'api-workdir', 'api-copy-all', 'api-pip', 'api-cmd-local'],
    dockerignore: false,
    multiStage: false,
    baseVariant: 'slim',
    note: 'COPY . . prije pip install, gunicorn sluša na 127.0.0.1',
  },
  'api-dobar': {
    project: 'klopa-api',
    cards: ['api-from', 'api-workdir', 'api-copy-req', 'api-pip', 'api-copy-all', 'api-user', 'api-expose', 'api-cmd'],
    dockerignore: true,
    multiStage: false,
    baseVariant: 'slim',
    note: 'requirements.txt prije koda, USER, gunicorn --bind 0.0.0.0:8000',
  },
}
