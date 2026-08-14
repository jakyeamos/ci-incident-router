const BOOLEAN_OPTIONS = new Set(["help", "start"]);

export function parseOptions(args) {
  const options = { positionals: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      options.positionals.push(argument);
      continue;
    }
    const [rawName, inlineValue] = argument.slice(2).split("=", 2);
    const name = rawName.replaceAll("-", "_");
    if (BOOLEAN_OPTIONS.has(name)) {
      options[name] = inlineValue === undefined ? true : inlineValue !== "false";
      continue;
    }
    const value = inlineValue ?? args[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${rawName}.`);
    options[name] = value;
  }
  return options;
}
