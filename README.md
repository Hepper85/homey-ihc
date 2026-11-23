# LK IHC til Homey Pro

En lokal Homey SDK 3-app til LK IHC / ELKO Living System med webservice. Homey læser controllerens projekt og abonnerer på ressourceændringer. Home Assistant, Python og en ekstern bro er ikke nødvendige.

## Installation

Kræver Homey Pro med Homey OS 12 eller nyere, adgang til controlleren på lokalnettet og Homey CLI på computeren.

```sh
cd ~/homey-ihc
npm ci
homey login
homey app install
```

I Homey: **Enheder → + → IHC Controller → IHC-ressource**. Indtast controllerens URL samt brugernavn og adgangskode. Vælg **Hent enheder**, og markér dem, du vil tilføje. Start gerne med en lampe: tænd den i Homey, sluk på vægkontakten, og kontrollér at begge ændringer bliver vist.

Brug samme URL ved senere parring; adressen og ressource-id'et identificerer enheden. For flere controllere gentages parringen med hver adresse. Login gemmes i appens lokale Homey-indstillinger. HTTP sender login ukrypteret. HTTPS understøtter betroede certifikater og de to kendte IHC-fabrikscertifikater, hvis controller og Homey kan forhandle TLS.

## Enheder og Flows

- Automatisk genkendelse følger produktlisten i [Home Assistants IHC-integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/ihc): relæer, lysdæmpere, stikkontakter, binære sensorer, temperatur, fugt og lux.
- For en funktionsblok eller et ukendt produkt: vælg **Tilføj manuelt**. Angiv et ressource-id i decimal eller hex (fx `12345` eller `_0x3039`), og vælg en type, der passer til ressourcens værdi. En dæmper bruger heltal 0–100. Du kan angive separate puls-id'er til tænd/sluk eller invertere en binær sensor.
- Flow-handlinger: pulsér i ca. 100 ms eller skriv en boolesk værdi, et heltal eller et decimaltal. Vælg en parret enhed fra den ønskede controller og angiv målressourcens id i decimal.
- Ved forbindelsesfejl markeres enheder utilgængelige. Appen forsøger at genetablere forbindelsen og læser tilstanden igen.

## Verifikation og kilder

`npm test` bruger en simuleret HTTP/SOAP-controller. `homey app validate` kontrollerer app-pakken. Disse kontroller erstatter ikke en test med dit IHC-projekt, din firmware og en fysisk Homey.

Produktoversigt: [ihc_auto_setup.yaml](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ihc/ihc_auto_setup.yaml). Protokolreference: [ihcsdk 2.8.14](https://pypi.org/project/ihcsdk/2.8.14/). [Dokumentation til originalintegrationen](https://www.home-assistant.io/integrations/ihc/).
