// Guess a category from an item name, so "Quick add" needs only a name.
const KEYWORDS: [string, string[]][] = [
  ["DOCUMENTS", ["passport", "visa", "ticket", "insurance", "licence", "license", "id card", "printout", "documents"]],
  ["ELECTRONICS", ["charger", "cable", "adapter", "power bank", "powerbank", "laptop", "phone", "headphones", "earbuds", "camera", "kindle"]],
  ["MEDICINE", ["medicine", "tablets", "pills", "repellent", "plaster", "ibuprofen", "paracetamol", "ors", "rehydration"]],
  ["TOILETRIES", ["toothbrush", "toothpaste", "shampoo", "soap", "deodorant", "razor", "sunscreen", "toiletries", "sanitizer", "perfume"]],
  ["CLOTHES", ["shirt", "t-shirt", "trousers", "jeans", "dress", "socks", "underwear", "jacket", "shoes", "sandals", "kurta", "clothes", "pyjama"]],
  ["FOOD", ["chocolate", "haribo", "sweets", "snacks", "tea", "coffee", "spices", "cookies", "biscuits", "nuts"]],
  ["GIFTS", ["gift", "present", "souvenir", "toy", "watch"]],
];

export function guessCategory(name: string): string {
  const text = name.toLowerCase();
  for (const [category, words] of KEYWORDS) if (words.some((w) => text.includes(w))) return category;
  return "OTHER";
}
