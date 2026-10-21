import Link from "next/link";
import type { MouseEvent } from "react";
import { CartIcon } from "./icons";
import Price from "./Price";
import type { BuyVariant } from "./ProductBuy";
import ProductArt from "./ProductArt";

export type CardProduct = {
  href: string;
  name: string;
  options: number;
  price?: number;
  tone: string;
  // present on the category shelf, where a tap opens the product sheet
  slug?: string;
  variants?: BuyVariant[];
};

// One card, five looks. The features are fixed: image, name, price, an
// options count where a product has variants, and one "Add to cart" action.
// With onOpen, a plain tap opens the product sheet instead of the page;
// a new-tab click still goes to the page.
export default function ProductCard({ product, onOpen }: { product: CardProduct; onOpen?: () => void }) {
  const open = onOpen
    ? (e: MouseEvent) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen();
      }
    : undefined;
  return (
    <li className="pc">
      <Link href={product.href} className="pc-link" onClick={open}>
        <div className="pc-img">
          <ProductArt name={product.name} tone={product.tone} />
        </div>
        <h3 className="pc-name">{product.name}</h3>
        {product.options > 0 && <span className="pc-opts">{product.options + 1} options</span>}
        <Price className="pc-price" value={product.price} />
      </Link>
      <Link href={onOpen ? product.href : "/cart"} className="pc-add" aria-label={`Add ${product.name} to cart`} onClick={open}>
        <CartIcon size={20} />
        <span className="pc-add-text">Add to cart</span>
      </Link>
    </li>
  );
}
