import { getStaticProductParams } from "@/lib/catalog-db";
import OpenInShelf from "./OpenInShelf";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticProductParams();
}

// There is no page of its own for a product: it opens in the sheet on its
// shelf. This address is kept for links made before (carts and wishlists
// saved in the browser, shared links), and sends them on to the shelf.
export default async function ProductPage(props: PageProps<"/shop/[category]/[product]">) {
  const { category, product } = await props.params;
  return <OpenInShelf href={`/shop/${category}?p=${encodeURIComponent(product)}`} />;
}
