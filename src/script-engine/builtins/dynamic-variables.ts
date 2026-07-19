const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
];
const COMPANIES = [
  "Acme Corp", "Globex", "Initech", "Umbrella", "Stark Industries", "Wayne Enterprises",
];
const CITIES = [
  "New York", "London", "Tokyo", "Berlin", "Sydney", "Toronto", "Paris", "Mumbai",
];
const COUNTRIES = [
  "United States", "United Kingdom", "Japan", "Germany", "Australia", "Canada", "France", "India",
];
const COLORS = [
  "red", "blue", "green", "purple", "orange", "teal", "indigo", "crimson",
];
const LOREM = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min = 0, max = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min = 0, max = 1): number {
  return Math.random() * (max - min) + min;
}

function randomUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomGuid(): string {
  return randomUuid().replace(/-/g, "").toUpperCase();
}

function randomEmail(): string {
  const user = `user${randomInt(100, 9999)}`;
  const domains = ["example.com", "test.io", "mail.dev", "demo.app"];
  return `${user}@${pick(domains)}`;
}

function randomPhone(): string {
  return `+1-${randomInt(200, 999)}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`;
}

function randomPassword(length = 12): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  return Array.from({ length }, () => pick(chars.split(""))).join("");
}

function randomSentence(): string {
  const words = Array.from({ length: randomInt(5, 12) }, () => pick(LOREM));
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function randomParagraph(): string {
  return Array.from({ length: randomInt(2, 4) }, () => randomSentence()).join(" ");
}

const DYNAMIC_HANDLERS: Record<string, () => string> = {
  $uuid: randomUuid,
  $guid: randomGuid,
  $timestamp: () => String(Date.now()),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(randomInt()),
  $randomFloat: () => String(randomFloat()),
  $randomBoolean: () => String(Math.random() < 0.5),
  $randomFirstName: () => pick(FIRST_NAMES),
  $randomLastName: () => pick(LAST_NAMES),
  $randomFullName: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
  $randomEmail: randomEmail,
  $randomPhone: randomPhone,
  $randomCompany: () => pick(COMPANIES),
  $randomCity: () => pick(CITIES),
  $randomCountry: () => pick(COUNTRIES),
  $randomColor: () => pick(COLORS),
  $randomPassword: randomPassword,
  $randomLorem: () => pick(LOREM),
  $randomSentence: randomSentence,
  $randomParagraph: randomParagraph,
  $randomImage: () =>
    `https://picsum.photos/seed/${randomInt(1, 9999)}/400/300`,
  $randomAvatar: () =>
    `https://i.pravatar.cc/150?u=${randomUuid()}`,
};

const customHandlers = new Map<string, () => string>();

export function registerDynamicVariable(
  name: string,
  handler: () => string,
): void {
  customHandlers.set(name.startsWith("$") ? name : `$${name}`, handler);
}

export function resolveDynamicVariable(name: string): string | undefined {
  const key = name.startsWith("$") ? name : `$${name}`;
  const custom = customHandlers.get(key);
  if (custom) return custom();
  const handler = DYNAMIC_HANDLERS[key];
  return handler ? handler() : undefined;
}

export function resolveDynamicVariablesIn(text: string): string {
  return text.replace(/\{\{\s*(\$[a-zA-Z][\w]*)\s*\}\}/g, (match, name: string) => {
    const value = resolveDynamicVariable(name);
    return value !== undefined ? value : match;
  });
}

export function listDynamicVariables(): string[] {
  return [
    ...Object.keys(DYNAMIC_HANDLERS),
    ...customHandlers.keys(),
  ];
}
