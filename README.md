# ffs

Small CommonJS CLI with subcommands.

## Local development

Run the CLI directly:

```sh
npm run ffs -- -- test --example
```

Install the `ffs` command binding locally:

```sh
npm link
ffs test --example
```

The `test` subcommand runs in the current working directory, so `ffs test` uses the folder you call it from.