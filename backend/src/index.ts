import createServer from './createServer';

async function main() {
  const server = await createServer();
  await server.start();

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main();