---
"@rizom/brain": patch
---

Slugs transliterate letters instead of dropping them: German umlauts and ß as German writes them without (Übermensch → uebermensch, Größe → groesse), other accents bare (décadence → decadence). Ids already stored keep their old form; an id derived again from a title with such letters takes the new form.
