# Remote Claude authentication

An owner-managed Claude CLI adapter may execute Claude on another machine while
keeping Drover and project files local. Set `CLAUDE_REMOTE_CLI_PATH` to the absolute
path of that adapter to query its `auth status` response rather than reading the
owner's local OAuth credentials. JavaScript adapters run with the server's Node
executable. Configure the execution adapter separately through the deployment's
existing `CLAUDE_CLI_PATH` mechanism.

The adapter must return the standard JSON object with boolean `loggedIn` and
optional `email` and `authMethod` fields on stdout. Diagnostics belong on stderr.
Malformed output, timeout, or a failed subprocess reports unverified remote
authentication; it never falls back to a potentially unrelated local account.
Member accounts retain their isolated local credential checks. The execution
adapter must likewise preserve member isolation.

This setting does not copy credentials, expose local files, or make SSH durable.
A separate authenticated local-tool bridge, persistent remote execution, and
transcript synchronization must be verified before claiming remote operation.
