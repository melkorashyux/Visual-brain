// Runs Next's standalone server.js inside the child process electron/main.js
// spawns. The IPC channel to the parent closes however the app goes away —
// a clean quit, a crash, or the AppImage being killed — so exiting on
// "disconnect" means the server can never outlive the app and keep holding
// its port (which would make the next launch talk to a stale server).
process.on("disconnect", () => process.exit(0));
require(process.argv[2]);
