# ffs

## todo: 

- [ ] rename specific tool support commands to e.g. t3:wt rather than a generic wt
- [ ] same for .NET testing util

### ffs az

Checks the Azure CLI sign-in, signs in through Microsoft Edge when the token is missing or expired, then shows a picker for the active subscription. Use `--tenant` to sign in to and filter by one tenant, `--login` to sign in again, and `--status` to only print the current account.

### ffs find

Lists the current directory tree, skipping hidden paths and common dependency, build, cache, and output directories by default. Add JavaScript regexes to `.ffsfindignore` in the current directory or an ancestor to skip more paths; regexes match the printed `./path` form case-insensitively.

```powershell
ffs find
```

### ffs path

Opens the ffs GUI for editing `Path` on Windows that, unlike the new GUI Tool made by Microsoft, does not suffer from "interesting" character limits to the PATH environment variable. The MS tool makes it error message  sound like it is a hard limit, but are actually just a bug in the program, the PATH can be longer without any problems. 

```powershell
ffs path
```

### ffs port

Lists Windows processes listening on TCP ports when called without arguments. When given ports, finds and kills the processes listening on them.

```powershell
ffs port 1234 4567
```


### ffs which

Shows where a command found on `PATH` is installed. Resolves symlinks and npm shims to the package directory, and lists the other installs on `PATH` that it shadows.

```powershell
ffs which codex
```

### ffs unlock

Keeps killing Windows processes that lock a file or folder until you stop it.

```powershell
ffs unlock .\event-hub
```

## .NET


### ffs test

Runs dotnet tests from the current working directory with redirected test artifacts. Avoids having to stop the application in visual studio just to build and run the tests in the background really quick.

```powershell
ffs test --filter FullyQualifiedName~EventLog
```

## specific tooling support

### ffs wt

Opens a Windows GUI listing git worktree created by [the T3 code tool](https://t3.codes/)  by project, Git branch, and folder name. Check any number of worktrees and delete the selection; registered worktrees are removed through Git, and stale folders are removed directly.

```powershell
ffs wt
```
