function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRuntimeDateContext(): string {
  return `Current date: ${getCurrentDate()}.

Your built-in knowledge may be outdated. Treat questions about what is current, latest, newest, most popular, recently released, or presently available as time-sensitive. Use current web evidence when available, and never claim something is current solely from your internal knowledge.`;
}

export function buildRuntimeDateSystemMessage() {
  return {
    role: "system" as const,
    content: getRuntimeDateContext(),
  };
}
