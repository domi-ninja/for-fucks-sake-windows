# ffs

## ffs az

Checks the Azure CLI sign-in, signs in through Microsoft Edge when the token is missing or expired, then shows a picker for the active subscription. Use `--tenant` to sign in to and filter by one tenant, `--login` to sign in again, and `--status` to only print the current account.

```powershell
ffs az --tenant contoso.onmicrosoft.com
```

## ffs find

Lists the current directory tree, skipping hidden paths and common dependency, build, cache, and output directories by default. Add JavaScript regexes to `.ffsfindignore` in the current directory or an ancestor to skip more paths; regexes match the printed `./path` form case-insensitively.

```powershell
ffs find
```

## ffs path

Opens the ffs GUI for editing `Path` on Windows.

```powershell
ffs path
```

## ffs test

Runs dotnet tests from the current working directory with redirected test artifacts.

```powershell
ffs test --filter FullyQualifiedName~EventLog
```

## ffs unlock

Keeps killing Windows processes that lock a file or folder until you stop it.

```powershell
ffs unlock .\event-hub
```
