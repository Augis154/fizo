# FIZO

## Sistemos paskirtis

Projekto tikslas – automatizuoti bei palengvinti sporto varžybų ir iššūkių organizavimą, normatyvų fiksavimą bei reitingavimą, suteikiant dalyviams galimybę patogiai stebėti asmeninį progresą.

Veikimo principas – kuriamą platformą sudaro internetinė aplikacija, skirta sporto erdvių organizatoriams ir dalyviams, bei aplikacijų programavimo sąsaja (angl. trump. API), atsakinga už logiką ir duomenų apdorojimą.

Sporto erdvės organizatorius, prisijungęs prie sistemos, gali kurti virtualias sporto erdves (varžybas ar iššūkius), parinkti standartizuotus varžybų šablonus (pvz., kariuomenės fizinio parengtumo testo, „Hyrox“) arba susikurti individualius normatyvus. Taip pat sugeneruoti unikalią prieigos nuorodą prie sporto erdvės. Dalyviai, pasinaudoję gauta nuoroda, be sudėtingų registracijos procedūrų gali operatyviai suvesti savo pasiektus rezultatus, matyti asmeninę rezultatų kitimo istoriją bei varžytis bendroje reitingų lentelėje. Organizatorius turi galimybę centralizuotai stebėti dalyvių aktyvumą, dalyvavimo statistiką bei visų savo sukurtų erdvių lyderių lenteles.

## Funkciniai reikalavimai

**Neregistruotas sistemos naudotojas galės:**
1. Peržiūrėti platformos reprezentacinį puslapį;
2. Prisijungti / registruotis organizatoriaus paskyrai susikurti;
3. Pasiekti konkrečią sporto erdvę pasinaudojęs gauta specialia nuoroda.

**Sporto erdvės dalyvis (prisijungęs per nuorodą) galės:**
1. Įvesti savo pradinius duomenis (vardą, amžių/gimimo metus pagal pasirinktą šabloną);
2. Registruoti pasiektus sportinius rezultatus:
    1. Suvesti rezultatus pagal sporto erdvės šabloną neribotą kiekį kartų;
    2. Suvesti rezultatus bet kuriuo varžybų metu;
3. Peržiūrėti savo fiksuotų rezultatų istoriją;
4. Peržiūrėti savo asmeninį progresą, lyginant jį su ankstesniais rezultatais;
5. Peržiūrėti sporto erdvės reitingų lentelę:
    1. Rikiuoti reitingų lentelės duomenis;
    2. Matyti savo asmeninę poziciją bendrame dalyvių reitinge.

**Sporto erdvės organizatorius galės:**
1. Prisijungti prie sistemos (naudojant naudotojo vardą/slaptažodį arba išorines autentifikacijos sistemas, pvz., „Google“);
2. Atsijungti nuo internetinės aplikacijos;
3. Sukurti naują sporto erdvę:
    1. Nurodyti erdvės pavadinimą;
    2. Parinkti varžybų šabloną (esamus sistemos šablonus, pvz., kariuomenės fizinio parengtumo, „Hyrox“);
    3. Nustatyti varžybų vykdymo datas;
    4. Sugeneruoti unikalią nuorodą dalyviams prisijungti;
4. Kurti individualius (angl. *custom*) šablonus:
    1. Apibrėžti specifinius pratimus bei normatyvus;
    2. Nustatyti šablono matomumą (palikti prieinamą tik sau arba padaryti viešai prieinamą visiems organizatoriams);
5. Peržiūrėti visų savo sukurtų sporto erdvių reitingų lenteles;
6. Peržiūrėti dalyvių sąrašus bei dalyvavimo varžybose statistiką (kiek kartų ir kokiose varžybose dalyvis startavo).