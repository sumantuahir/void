import http.server
import socketserver
import json
import os
import urllib.parse
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import threading
import hashlib
import random
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import IntegrityError
from dotenv import load_dotenv

# Load environmental variables from .env
load_dotenv()

PORT = int(os.getenv("PORT", 8000))
DB_URL = os.getenv("SUPABASE_DB_URL")
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

# ═══════════════════════════
# DATABASE INITIALIZATION
# ═══════════════════════════
class PooledConnection:
    def __init__(self, conn):
        self._conn = conn

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def close(self):
        # Do not close the connection so it stays in the pool/cache
        pass

    def actual_close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Context manager exit behaviour: commit or rollback but do not close
        return self._conn.__exit__(exc_type, exc_val, exc_tb)

_db_conn = None

def get_db_conn():
    global _db_conn
    if not DB_URL:
        raise ValueError("SUPABASE_DB_URL is not set in the environment variables.")
    
    if _db_conn is not None:
        try:
            if _db_conn.closed == 0:
                with _db_conn.cursor() as test_cur:
                    test_cur.execute("SELECT 1")
                return PooledConnection(_db_conn)
        except Exception:
            try:
                _db_conn.close()
            except Exception:
                pass
            _db_conn = None

    conn = psycopg2.connect(DB_URL)
    _db_conn = conn
    return PooledConnection(_db_conn)


def parse_images(images_str):
    if not images_str:
        return []
    raw_parts = images_str.split(",")
    parts = []
    i = 0
    while i < len(raw_parts):
        part = raw_parts[i]
        if part.startswith("data:image/") and i + 1 < len(raw_parts):
            parts.append(part + "," + raw_parts[i+1])
            i += 2
        else:
            parts.append(part)
            i += 1
    return parts

def get_razorpay_credentials():
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        try:
            settings = get_settings()
            if not key_id:
                key_id = settings.get("razorpay_key")
            if not key_secret:
                key_secret = settings.get("razorpay_secret")
        except Exception as e:
            print(f"Error getting credentials from DB: {e}")
    return key_id, key_secret

def is_admin(headers):
    email = headers.get('X-User-Email')
    if not email:
        return False
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT role FROM users WHERE LOWER(email) = LOWER(%s) AND status = 'active'", (email.strip(),))
        row = cursor.fetchone()
        conn.close()
        if row and row[0] in ['superadmin', 'admin', 'staff']:
            return True
    except Exception as e:
        print(f"Error checking admin role: {e}")
    return False

def init_db():
    conn = get_db_conn()
    cursor = conn.cursor()

    # Unconditionally force-update mock Razorpay credentials to the correct ones if settings table exists
    try:
        cursor.execute("UPDATE settings SET value = 'rzp_live_T78YfksyJxo5Hd' WHERE key = 'razorpay_key' AND (value IS NULL OR value = '' OR value = 'rzp_test_mock_key_id' OR value = 'rzp_test_T77MFwnA1Q4hFX')")
        cursor.execute("UPDATE settings SET value = 'QHwhu188386lMSsVeeswTR47' WHERE key = 'razorpay_secret' AND (value IS NULL OR value = '' OR value = 'rzp_test_mock_secret' OR value = 'ni4pNHaGXFKHjDHatmxWJ0AE')")
        conn.commit()
    except Exception as e:
        pass

    # Ensure tables are built to support advanced e-commerce fields in PostgreSQL

    # Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'customer',
            status TEXT DEFAULT 'active',
            orders_count INTEGER DEFAULT 0,
            total_spent REAL DEFAULT 0,
            date TEXT NOT NULL
        )
    ''')

    # Products Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            "desc" TEXT NOT NULL,
            category TEXT NOT NULL,
            stock INTEGER DEFAULT 0,
            colors TEXT NOT NULL,
            sizes TEXT NOT NULL,
            images TEXT NOT NULL,
            discount REAL DEFAULT 0,
            featured INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1
        )
    ''')

    # Orders Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            address TEXT NOT NULL,
            items TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            payment_status TEXT DEFAULT 'unpaid',
            paymentId TEXT,
            date TEXT NOT NULL
        )
    ''')

    # Contacts/Messages Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            reply TEXT,
            date TEXT NOT NULL,
            status TEXT DEFAULT 'open'
        )
    ''')

    # Visitors Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS visitors (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            ip TEXT,
            traffic_source TEXT DEFAULT 'Direct',
            date TEXT NOT NULL,
            page_views INTEGER DEFAULT 1
        )
    ''')

    # Sent Emails Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sent_emails (
            id SERIAL PRIMARY KEY,
            recipient TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            date TEXT NOT NULL,
            status TEXT DEFAULT 'success',
            error_log TEXT
        )
    ''')

    # Payments Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            order_id TEXT NOT NULL,
            transaction_id TEXT NOT NULL,
            method TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'success',
            date TEXT NOT NULL
        )
    ''')

    # Settings Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # Waitlist Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS waitlist (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            date TEXT NOT NULL
        )
    ''')

    # Coupons Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS coupons (
            code TEXT PRIMARY KEY,
            discount INTEGER NOT NULL,
            active INTEGER DEFAULT 1,
            expiry TEXT NOT NULL
        )
    ''')

    # Tickets Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            date TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            reply TEXT
        )
    ''')

    # Reviews Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            productId TEXT NOT NULL,
            userName TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            date TEXT NOT NULL
        )
    ''')

    # Check if database is already seeded to avoid re-inserting deleted products
    cursor.execute("SELECT value FROM settings WHERE key = 'db_seeded'")
    row = cursor.fetchone()
    if row and row[0] == 'true':
        conn.close()
        return

    # Seed Default Settings
    default_settings = [
        ("website_name", "VOID Essentials"),
        ("logo_url", ""),
        ("contact_email", "void.essential.in@gmail.com"),
        ("contact_phone", "+91 00000 00000"),
        ("social_instagram", "@void.essentials"),
        ("smtp_host", "smtp.gmail.com"),
        ("smtp_port", "587"),
        ("smtp_user", "void.essential.in@gmail.com"),
        ("smtp_pass", ""),
        ("razorpay_key", "rzp_live_T78YfksyJxo5Hd"),
        ("razorpay_secret", "QHwhu188386lMSsVeeswTR47"),
        ("seo_title", "VOID — Minimal Essentials"),
        ("seo_description", "Premium organic minimal essentials sourced from Surat, India.")
    ]
    cursor.executemany("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING", default_settings)


    # Default products seeding removed as requested (products should only exist if added by admin)


    # Seed Default Users
    admin_pass = hashlib.sha256("voidadmin".encode('utf-8')).hexdigest()
    cursor.execute('''
        INSERT INTO users (name, email, password, role, status, date)
        VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING
    ''', ("System Administrator", "void.essential.in@gmail.com", admin_pass, "superadmin", "active", datetime.now().isoformat()))
    
    new_admin_pass = hashlib.sha256("Void@2026".encode('utf-8')).hexdigest()
    cursor.execute('''
        INSERT INTO users (name, email, password, role, status, date)
        VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING
    ''', ("Sumantuahir", "Sumantuahir2005@gmail.com", new_admin_pass, "superadmin", "active", datetime.now().isoformat()))
    

    # Mock customer seeding removed as requested (dashboard should show real data)


    # Seed Coupons
    expiry_date = (datetime.now() + timedelta(days=30)).isoformat()
    cursor.execute("INSERT INTO coupons (code, discount, active, expiry) VALUES (%s, %s, %s, %s) ON CONFLICT (code) DO NOTHING", ("VOID10", 10, 1, expiry_date))
    cursor.execute("INSERT INTO coupons (code, discount, active, expiry) VALUES (%s, %s, %s, %s) ON CONFLICT (code) DO NOTHING", ("WELCOME20", 20, 1, expiry_date))

    cursor.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ("db_seeded", "true"))
    conn.commit()
    conn.close()

# ═══════════════════════════
# SMTP HELPER DISPATCH
# ═══════════════════════════
def get_settings():
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    return settings

def send_direct_email(recipient, subject, message):
    settings = get_settings()
    host = settings.get("smtp_host", "smtp.gmail.com")
    port = int(settings.get("smtp_port", 587))
    user = settings.get("smtp_user", "")
    password = settings.get("smtp_pass", "")
    
    conn = get_db_conn()
    cursor = conn.cursor()
    date_str = datetime.now().isoformat()

    if not user or not password:
        # Simulate local preview logging when credentials are unset
        cursor.execute('''
            INSERT INTO sent_emails (recipient, subject, message, date, status, error_log)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', (recipient, subject, message, date_str, "success", "Simulated delivery (No SMTP Credentials configured)"))
        conn.commit()
        conn.close()
        return True, "Simulated delivery logged successfully."

    try:
        msg = MIMEMultipart()
        msg['From'] = user
        msg['To'] = recipient
        msg['Subject'] = subject
        msg.attach(MIMEText(message, 'plain', 'utf-8'))

        server = smtplib.SMTP(host, port)
        server.starttls()
        server.login(user, password)
        server.sendmail(user, recipient, msg.as_string())
        server.quit()

        cursor.execute('''
            INSERT INTO sent_emails (recipient, subject, message, date, status, error_log)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', (recipient, subject, message, date_str, "success", "SMTP dispatched successfully"))
        conn.commit()
        conn.close()
        return True, "Email dispatched successfully via SMTP."
    except Exception as e:
        err_msg = str(e)
        cursor.execute('''
            INSERT INTO sent_emails (recipient, subject, message, date, status, error_log)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', (recipient, subject, message, date_str, "failed", err_msg))
        conn.commit()
        conn.close()
        return False, err_msg

# ═══════════════════════════
# REQUEST HANDLER
# ═══════════════════════════
class VoidRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PUT')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # Intercept SPA routes to serve index.html
        if path in ["/admin-login", "/admin-dashboard", "/login", "/signup"]:
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            with open("index.html", "rb") as f:
                self.wfile.write(f.read())
            return

        # 1. GET Settings API
        if path == "/api/settings":
            settings = get_settings()
            public_settings = {k: v for k, v in settings.items() if not k.endswith("pass") and not k.endswith("secret")}
            public_settings["razorpay_key_id"] = os.getenv("RAZORPAY_KEY_ID", settings.get("razorpay_key", "rzp_live_T78YfksyJxo5Hd"))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(public_settings).encode('utf-8'))
            return

        # GET Authenticated User's Orders API (History)
        elif path == "/api/orders/my" or path == "/api/orders":
            user_id = query.get("user_id", [None])[0]
            conn = get_db_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            if user_id:
                cursor.execute("SELECT * FROM orders WHERE LOWER(email) = LOWER(%s) ORDER BY date DESC", (user_id.strip(),))
            else:
                if is_admin(self.headers):
                    cursor.execute("SELECT * FROM orders ORDER BY date DESC")
                else:
                    self.send_response(401)
                    self.end_headers()
                    conn.close()
                    return
            
            rows = cursor.fetchall()
            orders = []
            for row in rows:
                orders.append({
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "address": row["address"],
                    "items": json.loads(row["items"]) if isinstance(row["items"], str) else row["items"],
                    "total": row["total"],
                    "status": row["status"],
                    "payment_status": row["payment_status"] if "payment_status" in row else "paid",
                    "paymentId": row.get("paymentid") if "paymentid" in row else row.get("paymentId"),
                    "date": row["date"]
                })
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(orders).encode('utf-8'))
            return

        # 2. GET Products API (Featured and Active support)
        elif path == "/api/products":
            conn = get_db_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # If admin key supplied, return everything. Otherwise active only.
            if is_admin(self.headers):
                cursor.execute("SELECT * FROM products ORDER BY code ASC")
            else:
                cursor.execute("SELECT * FROM products WHERE active = 1 ORDER BY code ASC")
            
            rows = cursor.fetchall()
            products = []
            for row in rows:
                products.append({
                    "id": row["id"],
                    "code": row["code"],
                    "name": row["name"],
                    "price": row["price"],
                    "desc": row["desc"],
                    "category": row["category"],
                    "stock": row["stock"],
                    "colors": row["colors"].split(",") if row["colors"] else [],
                    "sizes": row["sizes"].split(",") if row["sizes"] else [],
                    "images": parse_images(row["images"]),
                    "discount": row["discount"],
                    "featured": bool(row["featured"]),
                    "active": bool(row["active"])
                })
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(products).encode('utf-8'))
            return

        # 3. GET Reviews API
        elif path.startswith("/api/reviews/"):
            prod_id = path.split("/")[-1]
            conn = get_db_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM reviews WHERE productId = %s ORDER BY date DESC", (prod_id,))
            reviews = [{
                "id": row["id"],
                "userName": row.get("username") if "username" in row else row.get("userName"),
                "rating": row["rating"],
                "comment": row["comment"],
                "date": row["date"]
            } for row in cursor.fetchall()]
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(reviews).encode('utf-8'))
            return

        # 4. GET Coupon API
        elif path.startswith("/api/coupons/"):
            code = path.split("/")[-1].upper()
            conn = get_db_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM coupons WHERE code = %s AND active = 1", (code,))
            row = cursor.fetchone()
            conn.close()
            if row:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "code": row["code"],
                    "discount": row["discount"],
                    "active": bool(row["active"]),
                    "expiry": row["expiry"]
                }).encode('utf-8'))
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Coupon code invalid or expired."}).encode('utf-8'))
            return

        # 5. GET User Tickets API
        elif path == "/api/ticket":
            user_id = query.get("user_id", [None])[0]
            conn = get_db_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM tickets WHERE user_id = %s ORDER BY date DESC", (user_id,))
            tickets = [{
                "id": row["id"],
                "subject": row["subject"],
                "message": row["message"],
                "status": row["status"],
                "reply": row["reply"],
                "date": row["date"]
            } for row in cursor.fetchall()]
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(tickets).encode('utf-8'))
            return

        # 6. GET Admin Aggregations API (Complete metrics, stats, analytics)
        elif path == "/api/admin":
            if not is_admin(self.headers):
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode('utf-8'))
                return

            conn = get_db_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # 1. Fetch Orders
            cursor.execute("SELECT * FROM orders ORDER BY date DESC")
            orders = []
            for row in cursor.fetchall():
                orders.append({
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "address": row["address"],
                    "items": json.loads(row["items"]) if isinstance(row["items"], str) else row["items"],
                    "total": row["total"],
                    "status": row["status"],
                    "payment_status": row["payment_status"] if "payment_status" in row else "paid",
                    "paymentId": row.get("paymentid") if "paymentid" in row else row.get("paymentId"),
                    "date": row["date"]
                })

            # 2. Fetch Users & Calculate Individual spendings
            cursor.execute("SELECT id, name, email, role, status, date FROM users ORDER BY date DESC")
            users = []
            for row in cursor.fetchall():
                email = row["email"]
                user_orders = [o for o in orders if o["email"] == email]
                spent = sum(o["total"] for o in user_orders if o["status"] != "cancelled")
                users.append({
                    "id": row["id"],
                    "name": row["name"],
                    "email": email,
                    "role": row["role"],
                    "status": row["status"] if "status" in row else "active",
                    "orders_count": len(user_orders),
                    "total_spent": spent,
                    "date": row["date"]
                })

            # 3. Fetch Waitlist
            cursor.execute("SELECT * FROM waitlist ORDER BY date DESC")
            waitlist = [{"id": row["id"], "email": row["email"], "date": row["date"]} for row in cursor.fetchall()]

            # 4. Fetch Contacts/Messages
            cursor.execute("SELECT * FROM contacts ORDER BY date DESC")
            contacts = [{
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "subject": row["subject"],
                "message": row["message"],
                "reply": row["reply"] if "reply" in row else "",
                "status": row["status"],
                "date": row["date"]
            } for row in cursor.fetchall()]

            # 5. Fetch Products
            cursor.execute("SELECT * FROM products ORDER BY code ASC")
            products = []
            for row in cursor.fetchall():
                products.append({
                    "id": row["id"],
                    "code": row["code"],
                    "name": row["name"],
                    "price": row["price"],
                    "desc": row["desc"],
                    "category": row["category"],
                    "stock": row["stock"],
                    "colors": row["colors"].split(",") if row["colors"] else [],
                    "sizes": row["sizes"].split(",") if row["sizes"] else [],
                    "images": parse_images(row["images"]),
                    "discount": row["discount"],
                    "featured": bool(row["featured"]) if "featured" in row else False,
                    "active": bool(row["active"])
                })

            # 6. Fetch Tickets
            cursor.execute("SELECT * FROM tickets ORDER BY date DESC")
            tickets = [{
                "id": row["id"],
                "user_id": row["user_id"],
                "subject": row["subject"],
                "message": row["message"],
                "status": row["status"],
                "reply": row["reply"],
                "date": row["date"]
            } for row in cursor.fetchall()]

            # 7. Fetch Visitors
            cursor.execute("SELECT * FROM visitors ORDER BY date DESC")
            visitors = [{
                "id": row["id"],
                "session_id": row["session_id"],
                "ip": row["ip"],
                "traffic_source": row["traffic_source"],
                "date": row["date"],
                "page_views": row["page_views"]
            } for row in cursor.fetchall()]

            # 8. Fetch Sent Email History
            cursor.execute("SELECT * FROM sent_emails ORDER BY date DESC")
            sent_emails = [{
                "id": row["id"],
                "recipient": row["recipient"],
                "subject": row["subject"],
                "message": row["message"],
                "date": row["date"],
                "status": row["status"],
                "error_log": row["error_log"]
            } for row in cursor.fetchall()]

            # 9. Fetch System Settings
            cursor.execute("SELECT key, value FROM settings")
            settings = {row["key"]: row["value"] for row in cursor.fetchall()}

            conn.close()

            # ═══════════════════════════
            # CALCULATE METRICS
            # ═══════════════════════════
            total_revenue = sum(o["total"] for o in orders if o["status"] != "cancelled")
            
            # Orders counters
            orders_stats = {
                "pending": sum(1 for o in orders if o["status"] == "pending"),
                "processing": sum(1 for o in orders if o["status"] == "processing"),
                "shipped": sum(1 for o in orders if o["status"] == "shipped"),
                "delivered": sum(1 for o in orders if o["status"] == "delivered"),
                "cancelled": sum(1 for o in orders if o["status"] == "cancelled")
            }

            # Visitor Aggregates
            total_views = sum(v["page_views"] for v in visitors)
            unique_vids = len(set(v["session_id"] for v in visitors))
            returning_vids = sum(1 for v in visitors if v["page_views"] > 1)
            
            # Group traffic sources
            sources_grouped = {}
            for v in visitors:
                src = v["traffic_source"]
                sources_grouped[src] = sources_grouped.get(src, 0) + 1

            conv_rate = round((len(orders) / unique_vids) * 100, 2) if unique_vids > 0 else 0.0

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "orders": orders,
                "waitlist": waitlist,
                "contacts": contacts,
                "users": users,
                "products": products,
                "tickets": tickets,
                "visitors": visitors,
                "sent_emails": sent_emails,
                "settings": settings,
                "metrics": {
                    "totalRevenue": total_revenue,
                    "totalOrders": len(orders),
                    "pendingOrders": orders_stats["pending"],
                    "processingOrders": orders_stats["processing"],
                    "shippedOrders": orders_stats["shipped"],
                    "deliveredOrders": orders_stats["delivered"],
                    "cancelledOrders": orders_stats["cancelled"],
                    "totalProducts": len(products),
                    "totalUsers": len(users),
                    "totalVisitors": unique_vids,
                    "pageViews": total_views,
                    "returningVisitors": returning_vids,
                    "conversionRate": conv_rate,
                    "contactMessages": len(contacts),
                    "waitlistUsers": len(waitlist),
                    "trafficSources": sources_grouped
                }
            }).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))

        conn = get_db_conn()
        cursor = conn.cursor()

        # 1. POST Waitlist API
        if self.path == "/api/waitlist":
            email = data.get("email")
            date = data.get("date")
            try:
                cursor.execute("INSERT INTO waitlist (email, date) VALUES (%s, %s)", (email, date))
                conn.commit()
                self.send_response(201)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                print(f"Error inserting into waitlist: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            finally:
                conn.close()
            return

        # Razorpay Create Order Endpoint
        elif self.path == "/api/create-order":
            amount = data.get("amount") # in paise
            currency = data.get("currency", "INR")
            receipt = data.get("receipt", f"receipt_{int(datetime.now().timestamp())}")

            if not amount or int(amount) < 100:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Amount must be at least 100 paise"}).encode('utf-8'))
                conn.close()
                return

            try:
                import razorpay
                key_id, key_secret = get_razorpay_credentials()
                client = razorpay.Client(auth=(key_id, key_secret))
                order_data = {
                    "amount": int(amount),
                    "currency": currency,
                    "receipt": receipt,
                    "payment_capture": 1
                }
                razorpay_order = client.order.create(data=order_data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "order_id": razorpay_order["id"],
                    "amount": razorpay_order["amount"],
                    "currency": razorpay_order["currency"]
                }).encode('utf-8'))
            except Exception as e:
                print(f"Error creating Razorpay order: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Internal server error: {str(e)}"}).encode('utf-8'))
            finally:
                conn.close()
            return

        # Razorpay Verify Payment Signature Endpoint
        elif self.path == "/api/verify-payment":
            razorpay_payment_id = data.get("razorpay_payment_id")
            razorpay_order_id = data.get("razorpay_order_id")
            razorpay_signature = data.get("razorpay_signature")

            if not razorpay_payment_id or not razorpay_order_id or not razorpay_signature:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing required signature fields"}).encode('utf-8'))
                conn.close()
                return

            try:
                import razorpay
                key_id, key_secret = get_razorpay_credentials()
                client = razorpay.Client(auth=(key_id, key_secret))
                client.utility.verify_payment_signature({
                    'razorpay_order_id': razorpay_order_id,
                    'razorpay_payment_id': razorpay_payment_id,
                    'razorpay_signature': razorpay_signature
                })

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Payment verified successfully"}).encode('utf-8'))
            except Exception as e:
                print(f"Razorpay signature verification failed: {e}")
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Signature verification failed"}).encode('utf-8'))
            finally:
                conn.close()
            return

        # 2. POST Contact Form API
        elif self.path == "/api/contact":
            name = data.get("name")
            email = data.get("email")
            subject = data.get("subject", "General Enquiry")
            message = data.get("message")
            date = data.get("date")
            try:
                cursor.execute('''
                    INSERT INTO contacts (name, email, subject, message, date) 
                    VALUES (%s, %s, %s, %s, %s)
                ''', (name, email, subject, message, date))
                conn.commit()
                
                # Dispatch async notification email
                subj = f"[VOID Contact] Message from {name}"
                body = f"Name: {name}\nEmail: {email}\nSubject: {subject}\n\nMessage:\n{message}"
                threading.Thread(target=send_direct_email, args=(email, subj, body), daemon=True).start()

                self.send_response(201)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                print(f"Error inserting into contacts: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            finally:
                conn.close()
            return

        # 3. POST Orders API (Checkout payments integration)
        elif self.path == "/api/orders":
            order_id = data.get("id")
            name = data.get("name")
            email = data.get("email")
            address = data.get("address")
            items = data.get("items")
            total = data.get("total")
            payment_id = data.get("paymentId", "COD")
            date = data.get("date")

            # Check product stocks
            for item in items:
                cursor.execute("SELECT stock FROM products WHERE code = %s", (item.get("prodId"),))
                row = cursor.fetchone()
                if row and row[0] < item.get("qty"):
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Product {item.get('name')} is out of stock."}).encode('utf-8'))
                    conn.close()
                    return

            # Insert Order
            cursor.execute('''
                INSERT INTO orders (id, name, email, address, items, total, status, payment_status, paymentId, date)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (order_id, name, email, address, json.dumps(items), total, "pending", "paid", payment_id, date))

            # Log Payment Receipt
            cursor.execute('''
                INSERT INTO payments (order_id, transaction_id, method, amount, status, date)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (order_id, payment_id, "Razorpay Simulation", total, "success", date))

            # Decrement stocks
            for item in items:
                cursor.execute("UPDATE products SET stock = stock - %s WHERE code = %s", (item.get("qty"), item.get("prodId")))

            conn.commit()
            conn.close()

            # Email Invoice Dispatch
            subj = f"[VOID Order] Confirmation - Receipt {order_id}"
            body = f"Thank you for placing order {order_id}.\nTotal amount paid: ₹{total:,}.\nItems will arrive shortly."
            threading.Thread(target=send_direct_email, args=(email, subj, body), daemon=True).start()

            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 4. POST User Signup API
        elif self.path == "/api/signup":
            name = data.get("name")
            email = data.get("email", "").strip().lower()
            password = data.get("password")
            date = data.get("date")

            hashed_password = hashlib.sha256(password.encode('utf-8')).hexdigest()
            role = "superadmin" if email == "void.essentials.in@gmail.com" else "customer"

            try:
                cursor.execute('''
                    INSERT INTO users (name, email, password, role, status, date) 
                    VALUES (%s, %s, %s, %s, %s, %s)
                ''', (name, email, hashed_password, role, "active", date))
                conn.commit()
                self.send_response(201)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "user": {"name": name, "email": email, "role": role}}).encode('utf-8'))
            except IntegrityError:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Email already registered"}).encode('utf-8'))
            conn.close()
            return

        # 5. POST User Login API (Account suspension check)
        elif self.path == "/api/login":
            email = data.get("email", "").strip().lower()
            password = data.get("password")
            hashed_password = hashlib.sha256(password.encode('utf-8')).hexdigest()

            cursor.execute("SELECT name, email, role, status FROM users WHERE LOWER(email) = %s AND password = %s", (email, hashed_password))
            row = cursor.fetchone()
            if row:
                if row[3] == "suspended":
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Your account has been suspended. Please contact customer service."}).encode('utf-8'))
                else:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "user": {"name": row[0], "email": row[1], "role": row[2]}}).encode('utf-8'))
            else:
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Invalid email or password"}).encode('utf-8'))
            conn.close()
            return

        # 6. POST Products CRUD (featured and active management)
        elif self.path == "/api/products":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            code = data.get("code")
            name = data.get("name")
            price = float(data.get("price"))
            desc = data.get("desc")
            category = data.get("category")
            stock = int(data.get("stock"))
            colors = data.get("colors")
            sizes = data.get("sizes")
            images = data.get("images", "tee.png")
            discount = float(data.get("discount", 0))
            featured = 1 if data.get("featured") else 0
            prod_id = data.get("id")

            # Process and resolve base64 dataUrls directly into the images string (saving base64 directly to database)
            uploaded_images = data.get("uploaded_images", [])
            images_list = [img.strip() for img in data.get("images", "tee.png").split(",") if img.strip()]
            
            uploaded_map = {}
            for img in uploaded_images:
                img_name = img.get("name")
                img_data_url = img.get("dataUrl")
                if img_name and img_data_url:
                    uploaded_map[img_name] = img_data_url
                    
            resolved_images = []
            for img_name in images_list:
                if img_name in uploaded_map:
                    resolved_images.append(uploaded_map[img_name])
                else:
                    resolved_images.append(img_name)
            images = ",".join(resolved_images)

            if prod_id:
                cursor.execute('''
                    UPDATE products 
                    SET code=%s, name=%s, price=%s, "desc"=%s, category=%s, stock=%s, colors=%s, sizes=%s, images=%s, discount=%s, featured=%s
                    WHERE id=%s
                ''', (code, name, price, desc, category, stock, colors, sizes, images, discount, featured, prod_id))
            else:
                cursor.execute('''
                    INSERT INTO products (code, name, price, "desc", category, stock, colors, sizes, images, discount, featured)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (code, name, price, desc, category, stock, colors, sizes, images, discount, featured))
            
            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 7. POST Support Ticket API
        elif self.path == "/api/ticket":
            user_id = data.get("user_id")
            subject = data.get("subject")
            message = data.get("message")
            date = data.get("date")

            cursor.execute("INSERT INTO tickets (user_id, subject, message, date) VALUES (%s, %s, %s, %s)", (user_id, subject, message, date))
            conn.commit()
            conn.close()
            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 8. POST Product Review API
        elif self.path == "/api/reviews":
            prod_id = data.get("productId")
            user_name = data.get("userName")
            rating = int(data.get("rating"))
            comment = data.get("comment")
            date = data.get("date")

            cursor.execute("INSERT INTO reviews (productId, userName, rating, comment, date) VALUES (%s, %s, %s, %s, %s)",
                           (prod_id, user_name, rating, comment, date))
            conn.commit()
            conn.close()
            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 9. POST Support Ticket Reply (Admin restricted)
        elif self.path == "/api/ticket/reply":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return
            
            ticket_id = int(data.get("id"))
            reply = data.get("reply")
            cursor.execute("UPDATE tickets SET reply = %s, status = 'resolved' WHERE id = %s", (reply, ticket_id))
            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 10. POST Order Status Update (Admin restricted)
        elif self.path == "/api/orders/status":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            order_id = data.get("id")
            new_status = data.get("status")
            cursor.execute("UPDATE orders SET status = %s WHERE id = %s", (new_status, order_id))
            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 11. POST Delete Record
        elif self.path == "/api/delete":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            table = data.get("table")
            record_id = data.get("id")
            
            safe_tables = {
                "orders": "orders", 
                "waitlist": "waitlist", 
                "contacts": "contacts", 
                "users": "users", 
                "products": "products",
                "tickets": "tickets"
            }
            if table in safe_tables:
                if table == "orders":
                    cursor.execute(f"DELETE FROM {safe_tables[table]} WHERE id = %s", (record_id,))
                else:
                    cursor.execute(f"DELETE FROM {safe_tables[table]} WHERE id = %s", (int(record_id),))
                conn.commit()

            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 12. POST Clear Table
        elif self.path == "/api/clear":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            table = data.get("table")
            safe_tables = {
                "orders": "orders", 
                "waitlist": "waitlist", 
                "contacts": "contacts", 
                "users": "users", 
                "products": "products",
                "tickets": "tickets"
            }
            if table in safe_tables:
                if table == "users":
                    cursor.execute("DELETE FROM users WHERE role != 'superadmin'")
                else:
                    cursor.execute(f"DELETE FROM {safe_tables[table]}")
                conn.commit()

            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 13. POST Visitor Tracking API (Unique / Page Views logger)
        elif self.path == "/api/visitors":
            session_id = data.get("session_id")
            ip = data.get("ip", "127.0.0.1")
            source = data.get("traffic_source", "Direct")
            date_str = datetime.now().isoformat()

            cursor.execute("SELECT id, page_views FROM visitors WHERE session_id = %s", (session_id,))
            row = cursor.fetchone()
            if row:
                cursor.execute("UPDATE visitors SET page_views = page_views + 1 WHERE id = %s", (row[0],))
            else:
                cursor.execute('''
                    INSERT INTO visitors (session_id, ip, traffic_source, date, page_views) 
                    VALUES (%s, %s, %s, %s, %s)
                ''', (session_id, ip, source, date_str, 1))

            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 14. POST Send Email Composer API
        elif self.path == "/api/email/send":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            recipient = data.get("recipient")
            subject = data.get("subject")
            message = data.get("message")
            
            success, info = send_direct_email(recipient, subject, message)
            conn.close()

            if success:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": info}).encode('utf-8'))
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": info}).encode('utf-8'))
            return

        # 15. POST Update System Settings API
        elif self.path == "/api/settings":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            for key, val in data.items():
                cursor.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (key, str(val)))

            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 16. POST Suspend / Unsuspend User API
        elif self.path == "/api/users/suspend":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            user_id = data.get("id")
            new_status = data.get("status")

            cursor.execute("UPDATE users SET status = %s WHERE id = %s", (new_status, int(user_id)))
            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        # 17. POST Edit User details API
        elif self.path == "/api/users/edit":
            if not is_admin(self.headers):
                self.send_response(401)
                self.end_headers()
                conn.close()
                return

            user_id = data.get("id")
            name = data.get("name")
            email = data.get("email")
            role = data.get("role")

            cursor.execute("UPDATE users SET name = %s, email = %s, role = %s WHERE id = %s", (name, email, role, int(user_id)))
            conn.commit()
            conn.close()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            return

        conn.close()

if __name__ == '__main__':
    if not DB_URL:
        print("⚠️ ERROR: SUPABASE_DB_URL is not set. Please set it in your .env file.")
        exit(1)
    init_db()
    print(f"Starting upgraded e-commerce server on port {PORT} with database Supabase...")
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("", PORT), VoidRequestHandler)
    server.serve_forever()
