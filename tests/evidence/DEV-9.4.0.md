# DEV-9.4.0 — ראיות בדיקה, 2026-10-19

קוד 707ca7f4eedf9d5d7569f585d59b84deab0c87bd; CI 39308086233, verify 118250244666, success. פריסה dpl_2s7Mn4bgbEucPQGvKhRXhivsTuEL READY בפרויקט eifo-batuach-dev בלבד. הבדיקות הציבוריות לאחר הפריסה בתהליך.

## מקורות אמיתיים לפני פריסה
כתובות תל אביב / חיפה / אילת, קווים 72 / 5 / 10א, רשימת תחנות ולחיצה תוך התאמת מפעיל ומסלול; תחנה קצרה 72 בתגובה 19:06:46Z. תחנה 23014: 15 תחזיות ו-14 רכבים. קו 10א: 693 נקודות תוואי. אלה קריאות מקור אמיתיות בבדיקת שרת מקומית ב-CI, לפני פריסה, ולא אימות אתר ציבורי.

## בדיקות סינתטיות
בועית נעה השומרת אותו אובייקט, פרטים, גלילה ומיקוד; שעון חדש לאחר פקיעת שעון קודם, נסיעה חדשה, מהירות 0 וחץ מדווח; שורות הגעה שאינן נבנות מחדש; צבעי 60/120/180 ופקיעה; כשל תחנה ללא חידוש שעוני הרכב; מרוץ בקשות; התאמת מפעיל, סינון מסלול, אינדקס GTFS חדש; אריחים ריקים/פגי תוקף ומכסה; התאוששות מאגר בכפתור יחיד. גדלי תצוגה 1440×900, 390×844, 320×568, 844×390. אין להסיק מכאן שיש פקקים אמיתיים.

## קובצי ראיה
[ריצת CI](https://github.com/j-h-h/abc/actions/runs/39308086233) ו-[צילומי CI](https://github.com/j-h-h/abc/actions/runs/39308086233/artifacts/12214577229).
ארטיפקט 12214577229, 7300108 bytes, digest ספק: sha256:9ad4ea48a050276e019487c1fe68d7c471ca98726fa9518c803230acb6fd2f50. לא בוצעה הורדה ואימות hash מקומי לאחר ניתוק הסביבה. הצילומים כוללים נתוני מקור אמיתיים וסינתטיים, עם שמות מפורשים.

## פקקים
סטטוס המקור הציבורי לפני פריסה: connected=true / available=false / coverage-unavailable. אין כיסוי ישראל מאומת, אין פיקסלי תנועה אמיתיים ואין מודל ETA מאומת מהיסטוריה ופקקים.
דפי מקור שנפתחו מחדש:
- https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/product-information/market-coverage
- https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v1/product-information/market-coverage
- https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/product-information/market-coverage

לא שונו main, eifo-batuach-site או WORK, לא מוזגו ענפים ולא הופעל חיוב.
