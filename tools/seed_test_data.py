"""Babajee test data: wipe the old test data and write a fresh, realistic set
that exercises everything the admin tracks today (GST documents, visits and
the funnel, customers and support, the whole order lifecycle, supplier bills).

    python tools/seed_test_data.py <catalogue.json> <out-dir>

catalogue.json: the published catalogue as exported from the database
(variant id, product slug/name/category, option label, sku, GST rate).
Writes SQL files into out-dir, run in order:
    01_wipe.sql     test orders, seed customers, visits, test bills; series reset
    02_people.sql   test customers, addresses, sign-ins, saves, carts
    03_orders.sql   orders with items, costs, events, shipments, requests,
                    refunds, invoices and credit notes on the TEST series
    04_visits_*.sql site visits, searches and checkout steps (orders' visits too)
    05_bills.sql    test suppliers and bills (sets stock and buying prices)
    06_finish.sql   reviews, support notes; triggers and emails back on
Everything is marked as test (orders.is_test, profiles.is_test, suppliers and
stock_receipts.is_test, @seed.babajee.test emails). The real order, real
accounts, catalogue and Settings are never touched. Deterministic (seed 1915).
"""
import json
import math
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone, date

R = random.Random(1915)
IST = timezone(timedelta(hours=5, minutes=30))
NOW = datetime(2026, 11, 15, 18, 0, tzinfo=IST)
START = datetime(2026, 5, 16, 9, 0, tzinfo=IST)
ADMIN = "be981cde-0260-464b-87b3-54124892c035"  # Taha Shaikh, the shop admin
NS = uuid.UUID("6b1d6f0a-3c52-4b7e-9a51-0f1de0b1a915")


def uid(*parts):
    return str(uuid.uuid5(NS, "/".join(map(str, parts))))


def q(s):
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def ts(d):
    return q(d.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00"))


def money(x):
    return f"{x:.2f}"


def jq(o):
    return q(json.dumps(o, ensure_ascii=False)) + "::jsonb"


cat_path, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
raw = json.load(open(cat_path, encoding="utf-8"))
CAT = list(raw[0].values())[0] if isinstance(raw, list) else raw

# ---------------------------------------------------------------- prices for test orders
# The real catalogue has almost no selling prices yet, so test orders carry
# their own: a plausible price per category, fixed per option.
BAND = {
    "rolling-paper": (60, 260), "accessory": (99, 899), "rolling-tray": (199, 1299), "storage": (149, 999),
    "bong": (1299, 6999), "bong-accessory": (249, 1499), "ashtray": (199, 999), "pipe": (299, 2499),
    "grinder": (299, 2999), "filter": (60, 299), "rolling-tobacco": (450, 1450), "roach": (50, 150),
    "blunt-wraps": (99, 299), "lighter": (99, 699), "cigars": (299, 1499), "cleaning-accessory": (99, 499),
    "blunt-pre-rolled-cone": (99, 399), "lighter-refills": (199, 499), "keychain": (149, 299),
}
POP = {
    "rolling-paper": 30, "filter": 12, "roach": 10, "grinder": 14, "rolling-tray": 8, "lighter": 7, "accessory": 6,
    "storage": 5, "blunt-wraps": 4, "rolling-tobacco": 4, "bong-accessory": 3, "bong": 3, "pipe": 3, "ashtray": 3,
    "cigars": 2, "cleaning-accessory": 2, "blunt-pre-rolled-cone": 2, "lighter-refills": 2, "keychain": 1,
}
for v in CAT:
    lo, hi = BAND.get(v["cat"], (99, 999))
    rr = random.Random(v["v"])
    p = rr.uniform(lo, hi)
    v["sell"] = float(math.floor(p / 10) * 10 + 9) if p >= 100 else float(round(p / 5) * 5)
    if v.get("price") and float(v["price"]) > 0:
        v["sell"] = float(v["price"])
    v["costpct"] = rr.uniform(0.48, 0.66)
    v["rate"] = float(v.get("rate") or 18)
BYCAT = {}
for v in CAT:
    BYCAT.setdefault(v["cat"], []).append(v)
CATS = [c for c in POP if c in BYCAT]
CATW = [POP[c] for c in CATS]


def pick_variant(rr=R, cat=None):
    c = cat or rr.choices(CATS, CATW)[0]
    return rr.choice(BYCAT[c])


# ---------------------------------------------------------------- people
FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir", "Aditi", "Ananya", "Diya", "Isha", "Kavya", "Meera", "Nisha", "Pooja", "Riya", "Sneha", "Tanvi", "Zara", "Rahul", "Karan", "Nikhil", "Siddharth", "Varun", "Yash", "Aman", "Dev", "Neha", "Priya", "Shruti", "Simran", "Tara", "Kunal", "Manav", "Omkar", "Pranav", "Ritika", "Sana", "Farhan", "Imran", "Zoya", "Joel", "Neil", "Tanya", "Avni", "Harsh", "Jai"]
LAST = ["Sharma", "Verma", "Patel", "Iyer", "Nair", "Menon", "Reddy", "Rao", "Gupta", "Mehta", "Shah", "Desai", "Kulkarni", "Joshi", "Pillai", "D'Souza", "Fernandes", "Rodrigues", "Khan", "Shaikh", "Singh", "Gill", "Kapoor", "Malhotra", "Chatterjee", "Banerjee", "Das", "Bose", "Naik", "Pawar", "More", "Jadhav", "Gaikwad", "Sawant", "Thakur", "Chauhan", "Agarwal", "Bhat", "Hegde", "Shetty"]
STATES = [
    ("Maharashtra", "27", 40, [("Mumbai", "4000"), ("Pune", "4110"), ("Thane", "4006"), ("Nagpur", "4400"), ("Nashik", "4220")]),
    ("Karnataka", "29", 10, [("Bengaluru", "5600"), ("Mysuru", "5700")]),
    ("Delhi", "07", 9, [("New Delhi", "1100")]),
    ("Goa", "30", 6, [("Panaji", "4030"), ("Mapusa", "4035")]),
    ("Gujarat", "24", 6, [("Ahmedabad", "3800"), ("Surat", "3950")]),
    ("Tamil Nadu", "33", 5, [("Chennai", "6000"), ("Coimbatore", "6410")]),
    ("Telangana", "36", 5, [("Hyderabad", "5000")]),
    ("West Bengal", "19", 4, [("Kolkata", "7000")]),
    ("Kerala", "32", 4, [("Kochi", "6820"), ("Thiruvananthapuram", "6950")]),
    ("Uttar Pradesh", "09", 4, [("Lucknow", "2260"), ("Noida", "2013")]),
    ("Rajasthan", "08", 3, [("Jaipur", "3020")]),
    ("Haryana", "06", 2, [("Gurugram", "1220")]),
    ("Punjab", "03", 2, [("Chandigarh", "1600")]),
]
STREETS = ["MG Road", "Linking Road", "Hill Road", "Station Road", "Park Street", "Brigade Road", "FC Road", "SV Road", "LBS Marg", "Carter Road", "Church Street", "Ring Road"]
DEVICES = (["mobile", "desktop", "tablet"], [72, 23, 5])
UAS = {
    "mobile": ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36"],
    "desktop": ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15"],
    "tablet": ["Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"],
}
SOURCES = [("", "", 40), ("instagram.com", "", 22), ("google.com", "", 14), ("whatsapp.com", "", 8), ("facebook.com", "", 6),
           ("instagram.com", "instagram/social/diwali-drop", 4), ("google.com", "google/cpc", 3), ("whatsapp.com", "whatsapp/broadcast/restock", 3)]
SEARCHES = [("raw", 12), ("grinder", 18), ("tray", 9), ("filter tips", 7), ("bong", 6), ("ocb", 5), ("king size", 8), ("lighter", 6), ("ashtray", 4), ("cones", 3), ("clipper", 3), ("glass pipe", 2), ("hemp wraps", 2), ("vape", 0), ("papers 1 1/4", 0), ("rolling machine", 2), ("rizla", 0), ("dugout", 0), ("zippo", 0)]


def state_pick(rr):
    s = rr.choices(STATES, [x[2] for x in STATES])[0]
    city, pin = rr.choice(s[3])
    return s[0], s[1], city, pin + f"{rr.randint(1, 99):02d}"


def gstin_for(code, rr):
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    pan = "".join(rr.choice(letters) for _ in range(3)) + rr.choice("CF") + rr.choice(letters) + f"{rr.randint(0, 9999):04d}" + rr.choice(letters)
    return f"{code}{pan}1Z{rr.choice('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ')}"


people = []
for i in range(230):
    f, l = R.choice(FIRST), R.choice(LAST)
    st, code, city, pin = state_pick(R)
    joined = START - timedelta(days=R.randint(0, 40)) + timedelta(days=R.randint(0, 175))
    if joined > NOW - timedelta(days=1):
        joined = NOW - timedelta(days=R.randint(1, 30))
    dev = R.choices(*DEVICES)[0]
    people.append({
        "id": uid("person", i), "name": f"{f} {l}", "first": f, "last": l,
        "email": f"{f.lower()}.{l.lower().replace(chr(39), '')}{i}@seed.babajee.test",
        "phone": f"+91 {R.choice('6789')}{R.randint(100000000, 999999999)}",
        "state": st, "code": code, "city": city, "pin": pin,
        "line1": f"{R.randint(1, 240)}, {R.choice(['Sai', 'Shanti', 'Lotus', 'Green', 'Sunrise', 'Palm', 'Silver Oak'])} {R.choice(['Apartments', 'Residency', 'Heights', 'Villa', 'Towers'])}",
        "line2": R.choice(STREETS), "joined": joined, "device": dev, "visitor": uid("visitor", i),
        "dob": date(R.randint(1971, 2006), R.randint(1, 12), R.randint(1, 28)),
        "src": R.choices(SOURCES, [x[2] for x in SOURCES])[0],
        "b2b": i % 23 == 7,
    })
for p in people:
    if p["dob"] > date(2008, 11, 1):
        p["dob"] = date(2001, 5, 5)
    p["gstin"] = gstin_for(p["code"], R) if p["b2b"] else ""
    p["biz"] = R.choice(["Cafe", "Lounge", "Traders", "Hospitality", "Retail"]) if p["b2b"] else ""

files = {}


def emit(name, sql):
    files.setdefault(name, []).append(sql)


# ---------------------------------------------------------------- 01 wipe
emit("01_wipe.sql", """-- Wipe the test data. Real orders, real accounts, catalogue and Settings stay.
update public.email_config set enabled = false where id = 1;
alter table public.orders disable trigger orders_lock_invoiced;
alter table public.order_items disable trigger order_items_lock_invoiced;
alter table public.order_refunds disable trigger order_refunds_keep_noted;
alter table public.orders disable trigger audit_row;
alter table public.order_refunds disable trigger audit_row;
alter table public.profiles disable trigger audit_row;

delete from public.credit_notes where order_id in (select id from public.orders where is_test);
delete from public.orders where is_test;
delete from public.login_events where email like '%@seed.babajee.test' or profile_id in (select id from public.profiles where is_test);
delete from auth.users where email like '%@seed.babajee.test';
delete from public.profiles p where p.is_test and not exists (select 1 from auth.users u where u.id = p.id);
delete from public.site_events;

-- test supplier bills (and their stock): voided out of stock first, then removed
do $$
declare r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '""" + ADMIN + """', 'role', 'authenticated')::text, true);
  for r in select id from public.stock_receipts where is_test and status = 'posted' loop
    perform public.admin_void_receipt(r.id);
  end loop;
end $$;
-- the 0057 starting points of options bought on test bills go too, so the new
-- (backdated) test bills set their averages from scratch
delete from public.purchase_corrections pc
 where pc.reason = 'Starting point (0057)'
   and pc.variant_id in (select l.variant_id from public.stock_receipt_lines l join public.stock_receipts r on r.id = l.receipt_id where r.is_test);
delete from public.stock_movements where receipt_id in (select id from public.stock_receipts where is_test);
delete from public.stock_receipt_lines where receipt_id in (select id from public.stock_receipts where is_test);
delete from public.stock_receipts where is_test;
delete from public.suppliers where is_test;

-- every document series starts again (real ones at 0001)
delete from public.invoice_counters;
set constraints all immediate;
set constraints all deferred;

alter table public.orders enable trigger orders_lock_invoiced;
alter table public.order_items enable trigger order_items_lock_invoiced;
alter table public.order_refunds enable trigger order_refunds_keep_noted;
alter table public.orders enable trigger audit_row;
alter table public.order_refunds enable trigger audit_row;
alter table public.profiles enable trigger audit_row;
""")

# ---------------------------------------------------------------- 02 people
rows = []
for p in people:
    meta = {"full_name": p["name"], "phone": p["phone"], "age_confirmed": True, "date_of_birth": p["dob"].isoformat()}
    app = {"seed": True, "provider": "email", "providers": ["email"]}
    rows.append(f"('00000000-0000-0000-0000-000000000000', {q(p['id'])}, 'authenticated', 'authenticated', {q(p['email'])}, '', {ts(p['joined'])}, {jq(app)}, {jq(meta)}, {ts(p['joined'])}, {ts(p['joined'])})")
emit("02_people.sql", "alter table public.profiles disable trigger audit_row;\n")
emit("02_people.sql", "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values\n" + ",\n".join(rows) + ";")
for p in people:
    emit("02_people.sql", f"update public.profiles set is_test = true, full_name = {q(p['name'])}, phone = {q(p['phone'])}, date_of_birth = {q(p['dob'].isoformat())}, age_verified_at = {ts(p['joined'])}, created_at = {ts(p['joined'])}{', tags = array[' + q('wholesale') + ']' if p['b2b'] else ''} where id = {q(p['id'])};")
addr = [f"({q(uid('addr', p['id']))}, {q(p['id'])}, {q(p['name'])}, {q(p['phone'])}, {q(p['line1'])}, {q(p['line2'])}, '', {q(p['city'])}, {q(p['state'])}, {q(p['pin'])}, true, {ts(p['joined'])})" for p in people]
emit("02_people.sql", "insert into public.addresses (id, profile_id, recipient_name, phone, line1, line2, landmark, city, state, pincode, is_default, created_at) values\n" + ",\n".join(addr) + ";")

# sign-ins: a few good ones each, some mistyped passwords, one email under attack
logins = []
for p in people:
    t = p["joined"]
    for _ in range(R.randint(1, 5)):
        t = t + timedelta(days=R.uniform(3, 40), hours=R.uniform(0, 12))
        if t > NOW:
            break
        ua = R.choice(UAS[p["device"]])
        ip = f"{R.choice([49, 103, 106, 117, 157, 182])}.{R.randint(1, 254)}.{R.randint(1, 254)}.{R.randint(1, 254)}"
        if R.random() < 0.12:
            logins.append(f"({q(p['id'])}, {q(p['email'])}, false, 'Invalid login credentials', {q(ua)}, {q(ip)}, {ts(t - timedelta(seconds=40))})")
        logins.append(f"({q(p['id'])}, {q(p['email'])}, true, '', {q(ua)}, {q(ip)}, {ts(t)})")
victim = people[11]
for k in range(9):
    logins.append(f"(null, {q(victim['email'])}, false, 'Invalid login credentials', 'python-requests/2.32', '185.220.101.{40 + k}', {ts(NOW - timedelta(days=2, minutes=-k * 3))})")
emit("02_people.sql", "insert into public.login_events (profile_id, email, ok, reason, user_agent, ip, created_at) values\n" + ",\n".join(logins) + ";")

# saved products and carts left behind
saved = []
for p in R.sample(people, 70):
    for v in R.sample(CAT, R.randint(1, 3)):
        saved.append((p["id"], v))
seen = set()
srows = []
for pid, v in saved:
    if (pid, v["slug"]) in seen:
        continue
    seen.add((pid, v["slug"]))
    item = {"href": f"/shop/{v['cat']}?p={v['slug']}", "name": v["name"], "price": v["sell"], "options": 0}
    srows.append(f"({q(pid)}, {q(v['slug'])}, {jq(item)}, {ts(NOW - timedelta(days=R.uniform(1, 150)))})")
emit("02_people.sql", "insert into public.saved_products (profile_id, product_slug, item, created_at) values\n" + ",\n".join(srows) + ";")
crow = []
for p in R.sample(people, 16):
    lines = []
    for v in R.sample(CAT, R.randint(1, 4)):
        lines.append({"key": f"{v['slug']}::{v['label']}", "qty": R.randint(1, 3), "href": f"/shop/{v['cat']}?p={v['slug']}", "name": v["name"], "slug": v["slug"], "price": v["sell"], "variant": v["label"]})
    at = NOW - timedelta(hours=R.uniform(0.3, 400))
    crow.append(f"({q(uid('cart', p['id']))}, {q(p['id'])}, {jq(lines)}, {ts(at - timedelta(hours=2))}, {ts(at)})")
emit("02_people.sql", "insert into public.carts (id, profile_id, lines, created_at, updated_at) values\n" + ",\n".join(crow) + ";")
emit("02_people.sql", "alter table public.profiles enable trigger audit_row;\n")

# ---------------------------------------------------------------- 03 orders
CARRIERS = (["Delhivery", "Blue Dart", "DTDC", "India Post", "Shiprocket"], [40, 20, 15, 10, 15])
emit("03_orders.sql", """set constraints all deferred;
alter table public.orders disable trigger orders_log_event;
alter table public.orders disable trigger audit_row;
alter table public.order_refunds disable trigger audit_row;
alter table public.order_events disable trigger order_events_email;
""")

# order times: more orders as the shop grows
times = []
t = START
while t < NOW - timedelta(minutes=30):
    days = (t - START).days
    rate = 0.9 + 1.9 * days / 183  # orders per day
    t = t + timedelta(days=R.expovariate(rate))
    h = t.hour
    if h < 9:
        t = t.replace(hour=R.randint(10, 22), minute=R.randint(0, 59))
    if t < NOW - timedelta(minutes=30):
        times.append(t)
times.sort()

orders = []  # for visits and reviews
seq = 1600
bulk_done = 0
for n, t0 in enumerate(times):
    rr = random.Random(n * 7 + 3)
    # repeat buyers: a few customers order often
    p = people[rr.choice(range(len(people))) if rr.random() < 0.6 else rr.choice(range(40))]
    if p["joined"] > t0:
        p = rr.choice([x for x in people if x["joined"] <= t0] or people)
    oid = uid("order", n)
    seq += 1
    onum = f"BJ-{seq}"
    lines = []
    big = False
    if bulk_done < 2 and n in (int(len(times) * 0.4), int(len(times) * 0.75)):
        # a large inter-state consumer order (over the B2CL limit)
        v = pick_variant(rr, "bong")
        lines.append((v, 30))
        big = True
        bulk_done += 1
    else:
        for _ in range(rr.choices([1, 2, 3, 4], [45, 30, 17, 8])[0]):
            v = pick_variant(rr)
            if any(x[0]["v"] == v["v"] for x in lines):
                continue
            lines.append((v, rr.choices([1, 2, 3, 5], [70, 20, 7, 3])[0] * (4 if p["b2b"] else 1)))
    sub = round(sum(v["sell"] * qn for v, qn in lines), 2)
    ship = 0.0 if sub >= 999 else 79.0
    total = round(sub + ship, 2)
    age_days = (NOW - t0).total_seconds() / 86400
    st, code, city, pin = p["state"], p["code"], p["city"], p["pin"]
    if big and st == "Maharashtra":
        st, code, city, pin = "Karnataka", "29", "Bengaluru", "560034"

    # what happens to it
    fate = "delivered"
    x = rr.random()
    if age_days < 0.4:
        fate = rr.choice(["pending", "pending", "paid"])
    elif age_days < 1.5:
        fate = rr.choice(["paid", "packed", "pending"])
    elif age_days < 3:
        fate = rr.choice(["packed", "shipped", "shipped"])
    elif age_days < 6:
        fate = rr.choice(["shipped", "delivered", "delivered"])
    if fate == "delivered" and not big:
        if x < 0.05:
            fate = "cancel_unpaid"
        elif x < 0.07:
            fate = "cancel_request"
        elif x < 0.13:
            fate = "refund_partial"
        elif x < 0.16:
            fate = "return"
        elif x < 0.18:
            fate = "return_declined"
        elif x < 0.205:
            fate = "failed_resent"
        elif x < 0.22:
            fate = "came_back"
    if fate == "pending" and age_days > 1:
        fate = "cancel_unpaid"
    # the newest orders sit at every step, so each Orders tab has some
    recent = len(times) - n
    if recent <= 12:
        fate = ["pending", "paid", "packed", "shipped", "pending", "paid", "packed", "shipped", "paid", "pending", "packed", "shipped"][recent - 1]

    paid_at = t0 + timedelta(minutes=rr.uniform(4, 360))
    packed_at = paid_at + timedelta(hours=rr.uniform(3, 30))
    shipped_at = packed_at + timedelta(hours=rr.uniform(2, 28))
    delivered_at = shipped_at + timedelta(days=rr.uniform(1.5, 6))
    events = [("pending", "Order placed", t0)]
    status = "pending"
    paid = None
    shipments = []
    refunds = []
    request = None
    failed = None
    attempts = 0
    carrier = rr.choices(*CARRIERS)[0]
    track = f"{rr.randint(10**11, 10**12 - 1)}" if carrier != "India Post" else f"EE{rr.randint(10**8, 10**9 - 1)}IN"
    if fate == "cancel_unpaid":
        events.append(("cancelled", rr.choice(["Payment not received", "Customer changed their mind", "Ordered twice by mistake"]), t0 + timedelta(hours=rr.uniform(20, 60))))
        status = "cancelled"
    elif fate == "cancel_request":
        rq = t0 + timedelta(minutes=rr.uniform(10, 120))
        request = ("cancel", "accepted", rr.choice(["Ordered the wrong size", "Found it locally", "Need to change the address"]), [], "", rq, rq + timedelta(hours=rr.uniform(1, 6)))
        events.append(("request", f"Customer asked to cancel · {request[2]}", rq))
        events.append(("cancelled", "Cancelled at the customer's request", request[6]))
        status = "cancelled"
    else:
        steps = {"pending": 0, "paid": 1, "packed": 2, "shipped": 3}.get(fate, 4)
        if steps >= 1:
            events.append(("paid", "", paid_at))
            paid = paid_at
            status = "paid"
        if steps >= 2:
            events.append(("packed", "", packed_at))
            status = "packed"
        if steps >= 3:
            events.append(("shipped", "", shipped_at))
            status = "shipped"
            shipments.append([carrier, track, shipped_at, None])
            attempts = 1
        if steps >= 4:
            if fate in ("failed_resent", "came_back"):
                fail_at = shipped_at + timedelta(days=rr.uniform(1.5, 3))
                reason = rr.choice(["Customer not home", "Wrong or incomplete address", "Phone unreachable", "Refused the parcel"])
                events.append(("delivery_failed", reason, fail_at))
                if fate == "failed_resent":
                    again = fail_at + timedelta(days=rr.uniform(0.5, 2))
                    track2 = f"{rr.randint(10**11, 10**12 - 1)}"
                    events.append(("sent_again", f"{carrier} · {track2}", again))
                    shipments.append([carrier, track2, again, None])
                    attempts = 2
                    delivered_at = again + timedelta(days=rr.uniform(1, 4))
                    events.append(("delivered", "", delivered_at))
                    shipments[-1][3] = delivered_at
                    status = "delivered"
                else:
                    back = fail_at + timedelta(days=rr.uniform(4, 9))
                    refunds.append({"at": back + timedelta(hours=2), "lines": [(i, qn) for i, (v, qn) in enumerate(lines)], "ship": 0.0, "amount": sub, "returned": True, "reason": "Parcel came back to us: " + reason.lower()})
                    events.append(("return", "Parcel came back to us", back))
                    status = "refunded"
                    failed = None
            else:
                events.append(("delivered", "", delivered_at))
                shipments[-1][3] = delivered_at
                status = "delivered"
                if fate == "refund_partial":
                    at = delivered_at + timedelta(days=rr.uniform(0.5, 4))
                    if rr.random() < 0.5 and len(lines) >= 1:
                        i = rr.randrange(len(lines))
                        v, qn = lines[i]
                        amt = round(v["sell"] * (1 if rr.random() < 0.6 else 0.5), 2)
                        refunds.append({"at": at, "lines": [(i, 1)], "ship": 0.0, "amount": amt, "returned": False, "reason": rr.choice(["Arrived damaged, customer sent photos", "Wrong colour sent", "Missing from the parcel"])})
                    else:
                        amt = float(rr.choice([50, 75, 100, 150]))
                        refunds.append({"at": at, "lines": [], "ship": 0.0, "amount": min(amt, sub), "returned": False, "reason": rr.choice(["Late delivery, goodwill", "Discount we promised on WhatsApp", "Sorry for the wait"])})
                elif fate in ("return", "return_declined"):
                    i = rr.randrange(len(lines))
                    v, qn = lines[i]
                    rq = delivered_at + timedelta(days=rr.uniform(0.5, 5))
                    if fate == "return":
                        request = ("return", "accepted", rr.choice(["Lid doesn't close properly", "Didn't match the photos", "Arrived cracked"]), [{"qty": 1, "line": i}], "", rq, rq + timedelta(hours=rr.uniform(2, 30)))
                        events.append(("request", f"Customer asked to return {v['name']} · {request[2]}", rq))
                        refunds.append({"at": request[6] + timedelta(days=rr.uniform(2, 5)), "lines": [(i, 1)], "ship": 0.0, "amount": v["sell"], "returned": True, "reason": request[2]})
                    else:
                        request = ("return", "declined", "Changed my mind", [{"qty": 1, "line": i}], "Sorry, we can only take back items that arrive damaged or wrong.", rq, rq + timedelta(hours=rr.uniform(2, 30)))
                        events.append(("request", f"Customer asked to return {v['name']} · Changed my mind", rq))
    paid_total = total if paid else None
    if refunds:
        paid_total = total
        paid = paid or paid_at
    tot_ref = sum(r["amount"] for r in refunds)
    if refunds and tot_ref >= total - 0.01:
        status = "refunded"
    gstin = p["gstin"] if p["b2b"] and paid else ""
    session = uid("visit-order", n)[:32].replace("-", "")
    orders.append({"id": oid, "n": n, "p": p, "t0": t0, "lines": lines, "status": status, "delivered": status == "delivered", "session": session, "num": onum})

    cols = "id, order_number, profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_line2, address_landmark, address_city, address_state, address_pincode, subtotal, shipping, tax, total, notes, created_at, updated_at, is_test, gst_inclusive, paid_total, delivery_attempts, session_id, buyer_gstin"
    name = f"{p['name']}" + (f" ({p['biz']})" if gstin else "")
    emit("03_orders.sql", f"insert into public.orders ({cols}) values ({q(oid)}, {q(onum)}, {q(p['id'])}, {q(status)}, {q(name)}, {q(p['email'])}, {q(p['phone'])}, {q(p['line1'])}, {q(p['line2'])}, '', {q(city)}, {q(st)}, {q(pin)}, {money(sub)}, {money(ship)}, 0, {money(total)}, '', {ts(t0)}, {ts(events[-1][2])}, true, true, {money(paid_total) if paid_total is not None else 'null'}, {attempts}, {q(session)}, {q(gstin)});")
    item_ids = []
    for i, (v, qn) in enumerate(lines):
        iid = uid("item", n, i)
        item_ids.append(iid)
        emit("03_orders.sql", f"insert into public.order_items (id, order_id, variant_id, product_name, variant_label, sku, unit_price, quantity, gst_rate) values ({q(iid)}, {q(oid)}, {q(v['v'])}, {q(v['name'])}, {q(v['label'] if v['label'] != 'Default' else '')}, {q(v['sku'])}, {money(v['sell'])}, {qn}, {money(v['rate'])});")
        emit("03_orders.sql", f"insert into public.order_item_costs (order_item_id, unit_cost) values ({q(iid)}, {money(round(v['sell'] * v['costpct'], 2))});")
    emit("03_orders.sql", f"select public.order_retax({q(oid)});")
    for k, (s, note, at) in enumerate(events):
        emit("03_orders.sql", f"insert into public.order_events (id, order_id, status, note, actor_id, created_at) values ({q(uid('ev', n, k))}, {q(oid)}, {q(s)}, {q(note)}, {q(ADMIN) if s not in ('pending', 'request') else q(p['id'])}, {ts(at)});")
    for k, (c, tr, sa, da) in enumerate(shipments):
        emit("03_orders.sql", f"insert into public.shipments (id, order_id, carrier, tracking_number, shipped_at, delivered_at, created_at) values ({q(uid('ship', n, k))}, {q(oid)}, {q(c)}, {q(tr)}, {ts(sa)}, {ts(da) if da else 'null'}, {ts(sa)});")
    if request:
        kind, rstatus, reason, its, reply, at, done = request
        items = [{"qty": x["qty"], "item": item_ids[x["line"]]} for x in its]
        emit("03_orders.sql", f"insert into public.order_requests (id, order_id, kind, status, reason, items, reply, created_at, resolved_at, resolved_by) values ({q(uid('req', n))}, {q(oid)}, {q(kind)}, {q(rstatus)}, {q(reason)}, {jq(items)}, {q(reply)}, {ts(at)}, {ts(done)}, {q(ADMIN)});")
    if paid:
        # its tax invoice, on the TEST series, dated when it was paid
        emit("03_orders.sql", f"select public.issue_invoice({q(oid)});")
        emit("03_orders.sql", f"update public.orders set invoice_date = {ts(paid)} where id = {q(oid)};")
    for k, r in enumerate(refunds):
        rid = uid("refund", n, k)
        emit("03_orders.sql", f"insert into public.order_refunds (id, order_id, amount, subtotal, shipping, tax, restocked, returned, reason, actor_id, created_at) values ({q(rid)}, {q(oid)}, {money(r['amount'])}, {money(r['amount'] - r['ship'])}, {money(r['ship'])}, 0, false, {str(r['returned']).lower()}, {q(r['reason'])}, {q(ADMIN)}, {ts(r['at'])});")
        for i, qn in r["lines"]:
            emit("03_orders.sql", f"insert into public.order_refund_items (refund_id, order_item_id, quantity) values ({q(rid)}, {q(item_ids[i])}, {qn});")
        emit("03_orders.sql", f"update public.order_refunds set tax = public.refund_tax(id) where id = {q(rid)};")
        emit("03_orders.sql", f"select public.issue_credit_note({q(rid)});")
        emit("03_orders.sql", f"update public.credit_notes set issued_at = {ts(r['at'])} where refund_id = {q(rid)};")
        ev = "return" if r["returned"] else "refund"
        emit("03_orders.sql", f"insert into public.order_events (order_id, status, note, actor_id, created_at) values ({q(oid)}, {q(ev)}, {q('₹' + format(r['amount'], ',.0f') + ' · ' + r['reason'])}, {q(ADMIN)}, {ts(r['at'])});")
    if status == "refunded":
        emit("03_orders.sql", f"insert into public.order_events (order_id, status, note, actor_id, created_at) values ({q(oid)}, 'refunded', 'Everything paid has been refunded', {q(ADMIN)}, {ts(refunds[-1]['at'] + timedelta(seconds=1))});")

emit("03_orders.sql", """set constraints all immediate;
alter table public.orders enable trigger orders_log_event;
alter table public.orders enable trigger audit_row;
alter table public.order_refunds enable trigger audit_row;
alter table public.order_events enable trigger order_events_email;
""")

# ---------------------------------------------------------------- 04 visits
ev_rows = []


def visit(session, visitor, p, start, source, device, convert=None):
    ref, camp = source[0], source[1]
    at = start
    path = R.choice(["/", "/", "/shop", f"/shop/{R.choice(CATS)}"])
    rows = [("view", path, ref, "", None)]
    pages = R.randint(1, 6)
    added = []
    for _ in range(pages):
        c = R.choices(CATS, CATW)[0]
        rows.append(("view", f"/shop/{c}", "", "", None))
        if R.random() < 0.55:
            v = R.choice(BYCAT[c])
            rows.append(("product", f"/shop/{c}?p={v['slug']}", "", v["name"], None))
            if R.random() < 0.18:
                rows.append(("add", f"/shop/{c}?p={v['slug']}", "", v["name"] + (f" · {v['label']}" if v["label"] != "Default" else ""), None))
                rows.append(("cart", "/cart", "", "", None))
                added.append(v)
    if R.random() < 0.11:
        s, hits = R.choice(SEARCHES)
        rows.append(("search", "/shop", "", s, hits))
    if convert:
        for v, qn in convert["lines"]:
            rows.append(("product", f"/shop/{v['cat']}?p={v['slug']}", "", v["name"], None))
            rows.append(("add", f"/shop/{v['cat']}?p={v['slug']}", "", (f"{qn} × " if qn > 1 else "") + v["name"], None))
        rows.append(("cart", "/cart", "", "", None))
        rows.append(("checkout", "/checkout", "", "", None))
        rows.append(("step", "/checkout", "", "submit", None))
    elif added and R.random() < 0.35:
        rows.append(("checkout", "/checkout", "", "", None))
        rows.append(("step", "/checkout", "", R.choice(["sign-in needed", "blocked: no address", "sign-in needed", "submit"] if p else ["sign-in needed"]), None))
    for kind, path, r, label, value in rows:
        at = at + timedelta(seconds=R.uniform(8, 140))
        ev_rows.append(f"({q(session)}, {q(kind)}, {q(path)}, {q(r)}, {q(device)}, {ts(at)}, {q(p['id']) if p else 'null'}, {q(label)}, {q(visitor)}, {q(camp)}, {value if value is not None else 'null'})")


for o in orders:
    p = o["p"]
    src = p["src"] if R.random() < 0.6 else R.choices(SOURCES, [x[2] for x in SOURCES])[0]
    visit(o["session"], p["visitor"], p, o["t0"] - timedelta(minutes=R.uniform(6, 25)), src, p["device"], convert=o)
# browsing that didn't end in an order; some visitors come back
anon = [uid("anon", i) for i in range(2600)]
t = START
k = 0
while t < NOW:
    days = (t - START).days
    t = t + timedelta(minutes=R.expovariate((10 + 22 * days / 183) / 1440))
    if t >= NOW:
        break
    k += 1
    if R.random() < 0.25:
        p = R.choice([x for x in people if x["joined"] <= t] or people)
        visitor, device = p["visitor"], p["device"]
    else:
        p = None
        visitor = R.choice(anon[: max(50, int(len(anon) * (0.3 + 0.7 * days / 183)))])
        device = R.choices(*DEVICES)[0]
    visit(uid("visit", k).replace("-", "")[:32], visitor, p, t, R.choices(SOURCES, [x[2] for x in SOURCES])[0], device)
CH = 2500
for i in range(0, len(ev_rows), CH):
    emit(f"04_visits_{i // CH:02d}.sql", "insert into public.site_events (session_id, kind, path, referrer, device, created_at, profile_id, label, visitor_id, campaign, value) values\n" + ",\n".join(ev_rows[i:i + CH]) + ";")

# ---------------------------------------------------------------- 05 bills
SUPPLIERS = [
    ("Mumbai Smoke Supplies (test)", "27AAFCM4821K1Z3", "+91 98200 11223"),
    ("Delhi Paper Traders (test)", "07AAGFD9132L1ZQ", "+91 98110 44556"),
    ("Goa Glassworks (test)", "30ABCPG5521M1Z8", "+91 98221 77889"),
    ("Local wholesaler, no GSTIN (test)", "", "+91 90040 99887"),
]
bills = []
bd = START.date() - timedelta(days=6)
for k in range(14):
    s = SUPPLIERS[[0, 1, 0, 2, 1, 3, 0, 1, 2, 0, 3, 1, 0, 2][k]]
    lines = []
    for v in R.sample(CAT, R.randint(2, 6)):
        qty = R.choice([10, 12, 20, 24, 25, 30, 50])
        price = round(v["sell"] * v["costpct"] / (1 + v["rate"] / 100), 2)
        lines.append({"variant_id": v["v"], "qty": qty, "unit_price": price, "gst_rate": v["rate"]})
    in2b = k < 11
    month = (bd.replace(day=1) + timedelta(days=32)).replace(day=1) if bd.day > 20 else bd.replace(day=1)
    paid_on = None if k in (0, 12) else bd + timedelta(days=R.randint(5, 40))
    if paid_on and paid_on > NOW.date():
        paid_on = None
    bills.append((s, f"INV/{2600 + k}", bd, lines, in2b, month, paid_on))
    bd = bd + timedelta(days=R.randint(9, 15))
    if bd > NOW.date() - timedelta(days=3):
        break
b = ["do $$\ndeclare sid uuid; rid uuid;\nbegin",
     f"  perform set_config('request.jwt.claims', json_build_object('sub', '{ADMIN}', 'role', 'authenticated')::text, true);"]
for s in SUPPLIERS:
    b.append(f"  sid := public.admin_save_supplier(jsonb_build_object('name', {q(s[0])}, 'gstin', {q(s[1])}, 'phone', {q(s[2])}, 'notes', 'Test supplier'));")
    b.append("  update public.suppliers set is_test = true where id = sid;")
for s, no, bdate, lines, in2b, month, paid_on in bills:
    b.append(f"  select id into sid from public.suppliers where name = {q(s[0])};")
    b.append(f"  rid := public.admin_post_receipt('bill', sid, {q(no)}, {q(bdate.isoformat())}, 'Test bill', {jq(lines)});")
    b.append(f"  update public.stock_receipts set is_test = true, created_at = {ts(datetime.combine(bdate, datetime.min.time(), IST) + timedelta(hours=15))} where id = rid;")
    b.append(f"  update public.stock_movements set created_at = {ts(datetime.combine(bdate, datetime.min.time(), IST) + timedelta(hours=15))} where receipt_id = rid;")
    # the average is replayed in the backdated order (0057)
    b.append("  perform public.recost_variant(x.variant_id) from (select distinct variant_id from public.stock_receipt_lines where receipt_id = rid) x;")
    b.append(f"  perform public.admin_set_receipt_flags(rid, {str(in2b).lower()}, {q(month.isoformat()) if in2b else 'null'}, {q(paid_on.isoformat()) if paid_on else 'null'});")
b.append("end $$;")
emit("05_bills.sql", "\n".join(b))

# ---------------------------------------------------------------- 06 reviews, support, switch back on
rv = []
seen = set()
TITLES = {5: ["Love it", "Great quality", "Exactly as shown", "Fast delivery"], 4: ["Good buy", "Nice, sturdy", "Worth it"], 3: ["Okay", "Does the job"], 2: ["Not great"], 1: ["Broke in a week"]}
for o in orders:
    if not o["delivered"] or R.random() > 0.22:
        continue
    v = o["lines"][0][0]
    key = (o["p"]["id"], v["slug"])
    if key in seen:
        continue
    seen.add(key)
    star = R.choices([5, 4, 3, 2, 1], [55, 28, 10, 4, 3])[0]
    st = R.choices(["approved", "pending", "hidden"], [84, 12, 4])[0]
    at = o["t0"] + timedelta(days=R.uniform(4, 12))
    if at > NOW:
        continue
    rv.append(f"({q(v['slug'])}, {q(o['p']['id'])}, {star}, {q(R.choice(TITLES[star]))}, {q(R.choice(['', 'Would order again.', 'Packed well.', 'Smaller than I expected.', 'Good value for the price.']))}, {q(o['p']['first'] + ' ' + o['p']['last'][0] + '.')}, {q(st)}, {ts(at)}, {ts(at)})")
emit("06_finish.sql", "insert into public.product_reviews (product_slug, profile_id, rating, title, body, author, status, created_at, updated_at) values\n" + ",\n".join(rv) + ";")
notes = []
for o in R.sample([o for o in orders if o["status"] in ("delivered", "refunded", "shipped")], 22):
    ch = R.choice(["whatsapp", "whatsapp", "call", "email", "instagram"])
    body = R.choice(["Asked where the parcel is", "Wants a GST invoice for their cafe", "Asked about bulk pricing", "Reported a damaged lid", "Wanted to change the delivery address", "Asked if papers come in 1 1/4"])
    status = R.choice(["resolved", "resolved", "open"])
    at = o["t0"] + timedelta(days=R.uniform(0.5, 5))
    if at > NOW:
        at = NOW - timedelta(hours=3)
    notes.append(f"({q(o['p']['id'])}, {q(ADMIN)}, {q(body)}, {ts(at)}, 'contact', {q(ch)}, {q(o['id'])}, {q(status)}, {ts(at + timedelta(hours=4)) if status == 'resolved' else 'null'})")
for p in R.sample(people, 8):
    notes.append(f"({q(p['id'])}, {q(ADMIN)}, {q(R.choice(['Prefers WhatsApp over calls', 'Regular, buys papers every couple of weeks', 'Runs a cafe, may order in bulk', 'Ask for ID if ordering tobacco']))}, {ts(p['joined'] + timedelta(days=10))}, 'note', '', null, null, null)")
emit("06_finish.sql", "insert into public.customer_notes (profile_id, author_id, body, created_at, kind, channel, order_id, status, resolved_at) values\n" + ",\n".join(notes) + ";")
emit("06_finish.sql", "update public.email_config set enabled = true where id = 1;")

for name, parts in files.items():
    open(os.path.join(out, name), "w", encoding="utf-8", newline="\n").write("\n".join(parts) + "\n")
print(json.dumps({"customers": len(people), "orders": len(orders), "visit_rows": len(ev_rows), "bills": len(bills), "reviews": len(rv), "notes": len(notes), "files": sorted(files)}))
