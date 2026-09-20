"use client";

import Image from "next/image";
import Logo from "@/components/Logo";
import { b_sun } from "@/assets/pitch";
import { PRICE, PRICE_RANGES, REFINED_PRODUCTS, SIDE_CATEGORIES } from "./data";
import { BagIcon, CaretIcon, Heart, SearchIcon, TriBar } from "./parts";
import s from "./pitch.module.css";

const NAV = ["Home", "Shop", "About", "Journal", "Contact"];
const TRI: [string, string, string] = ["#3f8f4f", "#d9a83c", "#b53a32"];

export default function Refined() {
  return (
    <div className={s.wrap}>
      <header className={s.rfHeader}>
        <Image src={b_sun} alt="" className={s.rfSunArt} priority />
        <Logo className="w-48" priority />
        <nav aria-label="Main" className={s.rfNav}>
          {NAV.map((n) => (
            <a key={n} href="#refined" aria-current={n === "Shop" ? "page" : undefined}>
              {n}
            </a>
          ))}
        </nav>
        <div className={s.rfIcons}>
          <button type="button" aria-label="Search">
            <SearchIcon size={24} />
          </button>
          <button type="button" aria-label="Cart, 0 items">
            <BagIcon size={24} />
            <span>0</span>
          </button>
        </div>
        <p className={s.rfTag}>
          Good
          <br />
          People
          <br />
          Higher
          <br />
          Standards
          <TriBar colors={TRI} className={s.rfTagBar} />
        </p>
      </header>

      <div className={s.rfTitleRow}>
        <div>
          <p className={s.rfCrumb}>Tools &middot; Community &middot; A brighter tomorrow</p>
          <h1 className={s.rfH1}>Shop</h1>
          <p className={s.rfLead}>Quality pieces. Thoughtful tools. A higher standard.</p>
        </div>
        <div className={s.rfToolbar}>
          <label className={s.sort}>
            Sort by
            <select defaultValue="featured">
              <option value="featured">Featured</option>
              <option>Newest</option>
              <option>Price, low to high</option>
              <option>Price, high to low</option>
            </select>
          </label>
          <span className={s.rfCount}>24 products</span>
        </div>
      </div>

      <div className={s.rfBody}>
        <aside aria-label="Filters" className={s.rfSide}>
          <nav aria-label="Categories" className={s.rfCats}>
            <h2>Categories</h2>
            <ul>
              <li>
                <a href="#refined" aria-current="true">
                  All products
                </a>
              </li>
              {SIDE_CATEGORIES.map((c) => (
                <li key={c.name}>
                  <a href="#refined">{c.name}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={s.rfFilter}>
            <h2>Price</h2>
            {PRICE_RANGES.map((r) => (
              <label key={r} className={s.check}>
                <input type="checkbox" /> {r}
              </label>
            ))}
          </div>

          <div className={s.rfSideFoot}>
            <TriBar colors={TRI} className={s.rfSideBar} height={4} />
            <p>
              Slower days.
              <br />
              Brighter ways.
            </p>
          </div>
        </aside>

        <main>
          <ul className={s.grid}>
            {REFINED_PRODUCTS.map((p) => (
              <li key={p.name} className={s.rfTile}>
                <div className={s.rfTileImg}>
                  <Image src={p.image} alt={p.name} className={s.img} sizes="(min-width: 1100px) 22vw, 48vw" />
                  {p.badge && <span className={s.rfBadge}>{p.badge}</span>}
                </div>
                <div className={s.rfTileBody}>
                  <h3>{p.name}</h3>
                  <p className={s.rfPrice}>{PRICE}</p>
                  <div className={s.rfTileRow}>
                    <button type="button" className={s.rfBtn}>
                      Add to cart
                    </button>
                    <Heart label={p.name} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>

      <footer className={s.rfFooter}>
        <p>
          <span aria-hidden="true" /> Peace &middot; Good vibes &middot; Higher living <span aria-hidden="true" />
        </p>
        <TriBar colors={TRI} className={s.rfFootBar} />
        <a href="#refined" className={s.rfTop}>
          Back to top <CaretIcon size={12} />
        </a>
      </footer>
    </div>
  );
}
