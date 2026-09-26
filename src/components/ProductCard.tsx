import Link from "next/link";
import { CartIcon } from "./icons";
import Price from "./Price";
import ProductArt from "./ProductArt";

export type CardProduct = {
  href: string;
  name: string;
  options: number;
  price: number;
  tone: string;
};

// One card, five looks. The features are fixed: image, name, price, an
// options count where a product has variants, and one "Add to cart" action.
export default function ProductCard({ product }: { product: CardProduct }) {
  return (
    <li className="pc">
      <Link href={product.href} className="pc-link">
        <div className="pc-img">
          <ProductArt name={product.name} tone={product.tone} />
        </div>
        <h3 className="pc-name">{product.name}</h3>
        {product.options > 0 && <span className="pc-opts">{product.options + 1} options</span>}
        <Price className="pc-price" value={product.price} />
      </Link>
      <Link href="/cart" className="pc-add" aria-label={`Add ${product.name} to cart`}>
        <CartIcon size={20} />
        <span className="pc-add-text">Add to cart</span>
      </Link>
    </li>
  );
}
