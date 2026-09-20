"use client";

import Image from "next/image";
import Logo from "@/components/Logo";
import { c_palm } from "@/assets/pitch";
import { POSTER_PRODUCTS, PRICE, PRICE_RANGES, SIDE_CATEGORIES } from "./data";
import { BagIcon, CartIcon, CrownIcon, InstagramIcon, SearchIcon, TikTokIcon, YouTubeIcon } from "./parts";
import s from "./pitch.module.css";

const NAV = ["Home", "Shop", "About", "Journal", "Contact"];
const FEATURES = ["New", "Best sellers", "Staff picks", "On sale"];

export default function Poster() {
  return (
    <div>
      {/* Rough-edge filter for the headline. */}
      <svg width="0" height="0" aria-hidden="true" className={s.defs}>
        <filter id="po-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
        </filter>
      </svg>

      <header className={s.poHead}>
        <div className={s.poLogoCell}>
          <Logo className="w-44" priority />
          <p>
            Good
            <br />
            People
            <br />
            Higher Vibes
          </p>
        </div>
        <nav aria-label="Main" className={s.poNav}>
          {NAV.map((n) => (
            <a key={n} href="#poster" aria-current={n === "Shop" ? "page" : undefined}>
              {n}
            </a>
          ))}
        </nav>
        <div className={s.poIcons}>
          <button type="button" aria-label="Search">
            <SearchIcon size={26} />
          </button>
          <button type="button" aria-label="Cart, 0 items">
            <CartIcon size={28} />
            <span>0</span>
          </button>
        </div>
        <p className={s.poHeadTag}>
          Peace
          <br />
          People
          <br />
          Plants
          <br />
          Progress
        </p>
      </header>
      <div className={s.poStripe} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <section className={s.poHero} aria-label="Featured">
        <div className={s.poHeroCopy}>
          <p className={s.poKicker}>Shop all</p>
          <h1 className={s.poTitle}>
            <span className={s.poRed}>Quality</span> <span className={s.poGold}>Goods</span>
            <br />
            <span className={s.poCream}>Brighter</span> <span className={s.poGreen}>Days</span>
          </h1>
          <p className={s.poSub}>Pipes, accessories, storage, cleaning &amp; more.</p>
        </div>
        <Image src={c_palm} alt="" className={s.poPalm} priority />
        <p className={s.poScript}>
          Same skies
          <br />
          Different people
          <br />
          Brighter days
        </p>
        <div className={s.poPoster}>
          <CrownIcon size={44} />
          <p>
            Good
            <br />
            People
            <br />
            Good
            <br />
            Company
          </p>
        </div>
      </section>

      <div className={s.poBody}>
        <aside aria-label="Filters" className={s.poSide}>
          <nav aria-label="Categories" className={s.poCats}>
            <h2>
              Category <span aria-hidden="true">&minus;</span>
            </h2>
            <ul>
              <li>
                <a href="#poster" aria-current="true">
                  All products
                </a>
              </li>
              {SIDE_CATEGORIES.map((c) => (
                <li key={c.name}>
                  <a href="#poster">{c.name}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={s.poFilter}>
            <h2>
              Price <span aria-hidden="true">&minus;</span>
            </h2>
            {PRICE_RANGES.map((r) => (
              <label key={r} className={s.check}>
                <input type="checkbox" /> {r}
              </label>
            ))}
          </div>

          <div className={s.poFilter}>
            <h2>
              Features <span aria-hidden="true">&minus;</span>
            </h2>
            {FEATURES.map((f) => (
              <label key={f} className={s.check}>
                <input type="checkbox" /> {f}
              </label>
            ))}
          </div>
        </aside>

        <main>
          <div className={s.poToolbar}>
            <p>Showing 1&ndash;8 of 48 products</p>
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
            {POSTER_PRODUCTS.map((p) => (
              <li key={p.name} className={s.poItem}>
                <div className={s.poItemImg}>
                  <Image src={p.image} alt={p.name} className={s.img} sizes="(min-width: 1100px) 22vw, 48vw" />
                  {p.badge && <span className={s.poBadge}>{p.badge}</span>}
                </div>
                <div className={s.poItemBody}>
                  <div>
                    <h3>{p.name}</h3>
                    <p className={s.poNote}>{p.note}</p>
                    <p className={s.poPrice}>{PRICE}</p>
                  </div>
                  <button type="button" className={s.poCartBtn} aria-label={`Add ${p.name} to cart`}>
                    <BagIcon size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>

      <footer className={s.poFooter}>
        <Logo className="w-40" />
        <p>
          <i className={s.poDashR} aria-hidden="true" /> Peace in the everyday{" "}
          <i className={s.poDashG} aria-hidden="true" />
        </p>
        <nav aria-label="Footer">
          <a href="#poster">FAQ</a>
          <a href="#poster">Shipping</a>
          <a href="#poster">Returns</a>
          <span className={s.poSocial}>
            <InstagramIcon size={26} />
            <TikTokIcon size={26} />
            <YouTubeIcon size={26} />
          </span>
        </nav>
      </footer>
    </div>
  );
}
