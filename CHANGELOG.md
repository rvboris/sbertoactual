# Changelog

## [3.2.0](https://github.com/rvboris/sbertoactual/compare/sbertoactual-v3.1.0...sbertoactual-v3.2.0) (2026-04-26)


### Features

* disable word wrapping in logs ([4e16684](https://github.com/rvboris/sbertoactual/commit/4e16684685aece8aab27e83bf6f2f47364df2fc1))
* properly hide category name in logs using custom formatter ([e513a88](https://github.com/rvboris/sbertoactual/commit/e513a8846aedaf0e63c71b824506c206c9fc2fdf))

## [3.1.0](https://github.com/rvboris/sbertoactual/compare/sbertoactual-v3.0.0...sbertoactual-v3.1.0) (2026-04-26)


### Features

* add timestamps to logs ([10453de](https://github.com/rvboris/sbertoactual/commit/10453deb9ca77c8179b1da8e1660f8140b638a19))
* hide category prefix in logs ([8e489e5](https://github.com/rvboris/sbertoactual/commit/8e489e5b5c46ec89a657ae84de6aff51ecdca1fd))
* remove category name from logs ([4e62de1](https://github.com/rvboris/sbertoactual/commit/4e62de14458747cb2b262d1bfcce828f43db8770))


### Bug Fixes

* optimize api sessions and silence verbose logs to prevent sync loops ([49a0e6b](https://github.com/rvboris/sbertoactual/commit/49a0e6bede8426fb744e2d165d51bec3c3c67ffd))
* prevent server timeouts on large file uploads ([5268acb](https://github.com/rvboris/sbertoactual/commit/5268acbb80925b789436596aa1a0f97483dcc841))

## [3.0.0](https://github.com/rvboris/sbertoactual/compare/sbertoactual-v2.1.0...sbertoactual-v3.0.0) (2026-04-26)


### ⚠ BREAKING CHANGES

* migrate PDF parsing to @rvboris/sberparse

### Features

* add Docker publish workflow and switch to python3.14-nodejs24-alpine image ([425126c](https://github.com/rvboris/sbertoactual/commit/425126cbc5d15a4c0a5dc6172f2eadc8de183e40))
* add docker-compose, .env.example and update README with mode descriptions ([ac1d4bf](https://github.com/rvboris/sbertoactual/commit/ac1d4bf31f1a07a980e19e9a4c4eb16df6c60132))
* add dual publishing to GHCR and Docker Hub ([23b832c](https://github.com/rvboris/sbertoactual/commit/23b832cb130753ac3a71ba2ebe55951de60f4795))
* add optional API key authentication for server mode ([21acf0f](https://github.com/rvboris/sbertoactual/commit/21acf0f1d694844b22e959426142731ba00f052e))
* improve CI pipelines, add dependabot and english documentation ([1355517](https://github.com/rvboris/sbertoactual/commit/13555173224ca6aff4f7040eb0029dbca7d25f66))
* migrate PDF parsing to @rvboris/sberparse ([d295b8c](https://github.com/rvboris/sbertoactual/commit/d295b8cf51e8479fe025bf3c3883cf62709c2c63))
* prepare for npm publication and add npm-publish workflow ([589f266](https://github.com/rvboris/sbertoactual/commit/589f266b913e6d3daa75d3b9fd0256b112ba0057))
* **server:** migrate upload API to hono ([196b493](https://github.com/rvboris/sbertoactual/commit/196b493944f3770b741a845be98f5d339abf3b34))


### Bug Fixes

* allow pnpm build scripts for native modules (better-sqlite3) ([3dc7742](https://github.com/rvboris/sbertoactual/commit/3dc77429cd7b52e710a6e3e3727ba9edae574f78))
* **ci:** align release flow with sberparse ([39017b8](https://github.com/rvboris/sbertoactual/commit/39017b8f722db5f5f841de107ec14cb7019eee51))
* **ci:** fix invalid docker tag on PR by using IMAGE_NAME instead of secret ([442ac97](https://github.com/rvboris/sbertoactual/commit/442ac97fbc2beb7d9d471363496de4c8b2b73c92))
* **ci:** remove duplicate pnpm version ([0f20ac7](https://github.com/rvboris/sbertoactual/commit/0f20ac718474fee785c94b35fcac9d760d675ef3))
* **ci:** repair lockfile and limit coverage reporting ([2c79690](https://github.com/rvboris/sbertoactual/commit/2c79690b20b4a866a8bea85e4b4604517754567b))
* correct environment variable syntax in docker-publish.yml ([53fd9cc](https://github.com/rvboris/sbertoactual/commit/53fd9ccd30538277d235da013620ef2ef1a8176f))
* correct vitest coverage action repository name ([f916337](https://github.com/rvboris/sbertoactual/commit/f916337ae4f581723e2b2961f20d7d7a541f3f08))
* correctly build better-sqlite3 native bindings using pnpm.onlyBuiltDependencies ([1645269](https://github.com/rvboris/sbertoactual/commit/164526927607ec7f475320e5b3dead6bf72e21e8))
* correctly configure vitest coverage reporters via vitest.config.ts ([0a59ffb](https://github.com/rvboris/sbertoactual/commit/0a59ffb53c3e4940e280bfe7f41f03c476e09066))
* **docker:** use node user in runtime image ([336e1c6](https://github.com/rvboris/sbertoactual/commit/336e1c66b2439cfde49622d546dc2df25141abf3))
* move @fastify/multipart to dependencies for production server ([8fee12b](https://github.com/rvboris/sbertoactual/commit/8fee12bc0b8f475abf77df7c63ff4fe75a5ea520))
* pass pull-requests: write permission to reusable workflow ([ac408a9](https://github.com/rvboris/sbertoactual/commit/ac408a9cb6682f161146bd92b357edd69bae576c))
* remove explicit pnpm version to avoid conflict with package.json ([cd98fa4](https://github.com/rvboris/sbertoactual/commit/cd98fa410907dbcd723d192be27fc06508977be8))
* replace 'npm run' with 'pnpm run' in scripts to avoid npm warnings ([6d6f3cc](https://github.com/rvboris/sbertoactual/commit/6d6f3cc74acfb001004e1aaf67ae3fe7b0f84370))
* resolve better-sqlite3 binding error by aligning builder with runtime (Alpine) ([e4d883a](https://github.com/rvboris/sbertoactual/commit/e4d883a370015e0a9de7209ba023aed671b7aa7b))
* resolve sberbank2Excel permission denied by installing as non-root user ([10674eb](https://github.com/rvboris/sbertoactual/commit/10674eba265bf2a0f7c4caaeecab25417a6cdfc9))
* resolve TS2445 protected property error in tests ([f70b9fc](https://github.com/rvboris/sbertoactual/commit/f70b9fc3d021e7cd0f6e9af01bce31662297a1bf))
* **tests:** restore mock constructor behavior for ActualProcessor ([f97f4b2](https://github.com/rvboris/sbertoactual/commit/f97f4b26d84842dbd723d568439c05e7bb131400))

## Changelog

All notable changes to this project will be documented in this file.
