# Vendored release artifacts

VEIL vendors the official Starknet Privacy SDK release tarball because the
public package is distributed through GitHub Packages, which requires an
authentication token even for installation. The vendored artifact keeps local
and CI installs deterministic without storing a registry credential.

## Starknet Privacy SDK

- package: `@starkware-libs/starknet-privacy-sdk`
- version: `0.14.3-rc.2`
- upstream tag: `PRIVACY-0.14.3-RC.2`
- upstream commit: `9bfeb8dd35565a2915a0617dff3f649bd5bb891a`
- upstream repository: <https://github.com/starkware-libs/starknet-privacy>
- artifact: `starkware-libs-starknet-privacy-sdk-0.14.3-rc.2.tgz`
- npm shasum: `2720f2836f8760991dd2749d3e7d0b67fdb70bed`
- npm integrity: `sha512-MK4KDeHOdJAwzhoZJTF8MGwAnHxIzhu9B3h/JC7ER+RWK1Z3y6A7Re31p0hV+2D2Z1vhmVFGOCEqd9+3e6VTeQ==`

The tarball was produced without source modification by running `npm ci`,
`npm run build`, `npm run test:fast`, and `npm pack` in the upstream SDK
directory at the pinned commit. The upstream fast suite passed 252 tests.

Do not patch the archive. Upgrade by selecting a verified compatibility row,
building that exact upstream tag, rerunning its tests, replacing the archive,
and updating this provenance record and the shared VEIL network manifest.
