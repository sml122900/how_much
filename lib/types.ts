export type Product = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  price: number;
  category: string;
  partner_url: string;
  price_checked_at: string; // YYYY-MM-DD
};

export type GuessResult = {
  product: Product;
  guess: number;
  errorPct: number;
  hit: boolean;
  cheaper: boolean;
  points: number;
};
