"use client";

import Image from "next/image";
import Logo from "@/components/Logo";
import { a_lion } from "@/assets/pitch";
import { EDITORIAL_PRODUCTS, PRICE, PRICE_RANGES, SIDE_CATEGORIES } from "./data";
import {
  ArrowIcon,
  BagIcon,
  Heart,
  InstagramIcon,
  Mountain,
  Palm,
  SearchIcon,
  TikTokIcon,
  TriBar,
  YouTubeIcon,
} from "./parts";
import s from "./pitch.module.css";

const NAV = ["Shop", "About", "Journal", "Contact"];
const SWATCHES = [
  ["Rasta", "linear-gradient(135deg,#d93a2b 0 33%,#f2c230 33% 66%,#3aa657 66%)"],
  ["Black", "#111"],
  ["Clear", "#cfcfcf"],
  ["Wood", "#a06b3c"],
  ["Metal", "#9a9a9a"],
  ["Other", "#a78bdc"],
] as const;

const TRI: [string, string, string] = ["#d93a2b", "#f2c230", "#3aa657"];

export default function Editorial() {
  return (
    <div className={s.wrap}>
      <header className={s.edHeader}>
        <Logo className="w-48" priority />
        <nav aria-label="Main" className={s.edNav}>
          {NAV.map((n) => (
            <a key={n} href="#editorial" aria-current={n === "Shop" ? "page" : undefined}>
              {n}
            </a>
          ))}
        </nav>
        <div className={s.edIcons}>
          <button type="button" aria-label="Search">
            <SearchIcon />
          </button>
          <button type="button" aria-label="Cart, 0 items">
            <BagIcon />
            <span>0</span>
          </button>
        </div>
        <p className={s.edTag}>
          Good people
          <br />
          Better vibes
          <TriBar colors={TRI} className={s.edTagBar} />
        </p>
      </header>

      <section className={s.edHero} aria-label="Featured">
        <Palm className={s.edLeaf} fill="#0f2a17" />
        <div>
          <h1 className={s.edHeroTitle}>
            Tools for
            <br />a <span className={s.edGold}>Bright</span>
            <span className={s.edRed}>er</span>
            <br />
            Everyday
          </h1>
          <p className={s.edHeroSub}>Quality goods. Positive vibes.</p>
        </div>
        <Image src={a_lion} alt="" className={s.edLion} priority />
        <p className={s.edScript}>
          Different
          <br />
          Vibes
          <br />
          Same Roots
          <TriBar colors={TRI} className={s.edScriptBar} />
        </p>
      </section>

      <div className={s.edBody}>
        <aside className={s.edSide} aria-label="Filters">
          <nav aria-label="Categories" className={s.edCats}>
            <h2>
              Categories <span aria-hidden="true">&minus;</span>
            </h2>
            <ul>
              <li>
                <a href="#editorial" aria-current="true">
                  All products
                </a>
              </li>
              {SIDE_CATEGORIES.map((c) => (
                <li key={c.name}>
                  <a href="#editorial">{c.name}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={s.edFilter}>
            <h2>
              Price <span aria-hidden="true">&minus;</span>
            </h2>
            {PRICE_RANGES.map((r) => (
              <label key={r} className={s.check}>
                <input type="checkbox" /> {r}
              </label>
            ))}
          </div>

          <div className={s.edFilter}>
            <h2>
              Colour <span aria-hidden="true">&minus;</span>
            </h2>
            {SWATCHES.map(([name, bg]) => (
              <label key={name} className={s.swatch}>
                <input type="radio" name="ed-colour" />
                <i style={{ background: bg }} />
                {name}
              </label>
            ))}
          </div>

          <div className={s.edPromo}>
            <Palm className={s.edPromoPalmL} />
            <Palm className={s.edPromoPalmR} />
            <p>
              Good goods
              <br />
              Brighter days.
              <TriBar colors={TRI} className={s.edPromoBar} />
            </p>
          </div>
        </aside>

        <main>
          <div className={s.edMainHead}>
            <h2>All Products</h2>
            <label className={s.sort}>
              Sort by
              <select defaultValue="featured">
                <option value="featured">Featured</option>
                <option>Newest</option>
                <option>Price, low to high</option>
                <option>Price, high to low</option>
              </select>
            </label>
          </div>

          <ul className={s.grid}>
            {EDITORIAL_PRODUCTS.map((p) => (
              <li key={p.name} className={s.edCard}>
                <div className={s.edCardImg}>
                  <Image src={p.image} alt={p.name} className={s.img} sizes="(min-width: 1100px) 22vw, 48vw" />
                  <span className={s.edHeart}>
                    <Heart label={p.name} />
                  </span>
                </div>
                <div className={s.edCardBody}>
                  <h3>{p.name}</h3>
                  <p className={s.edNote}>{p.note}</p>
                  <p className={s.edPrice}>{PRICE}</p>
                  <div className={s.edDots} aria-hidden="true">
                    {p.dots?.map((d, i) => (
                      <i key={i} data-dot={d} />
                    ))}
                  </div>
                  <button type="button" className={s.edBtn}>
                    Add to cart
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <section className={s.edBanner} aria-label="Promotion">
            <Mountain className={s.edBannerMtn} fill="#0d1f14" />
            <Palm className={s.edBannerPalmL} />
            <Palm className={s.edBannerPalmR} />
            <p className={s.edBannerText}>
              More Than a Shop.
              <br />A State of Mind.
            </p>
            <a href="#editorial" className={s.edBannerBtn}>
              Explore more <ArrowIcon size={16} />
            </a>
          </section>
        </main>
      </div>

      <footer className={s.edFooter}>
        <Logo className="w-36" />
        <nav aria-label="Footer">
          {NAV.map((n) => (
            <a key={n} href="#editorial">
              {n}
            </a>
          ))}
        </nav>
        <div className={s.edSocial}>
          <InstagramIcon />
          <TikTokIcon />
          <YouTubeIcon />
        </div>
        <p className={s.edTag}>
          Good people
          <br />
          Better vibes
        </p>
      </footer>
    </div>
  );
}
