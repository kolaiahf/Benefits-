import { loadBrand } from "../../src/brand";
import { QuoteApp } from "./QuoteApp";

export default function QuotesPage() {
  return <QuoteApp productName={loadBrand().productName} />;
}
