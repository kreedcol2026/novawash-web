# NovaWash: Deploy automático GitHub -> Hostinger

## 1) Instalar Git en tu Mac (solo una vez)
En Terminal ejecuta:

```bash
xcode-select --install
```

Luego cierra y abre de nuevo Terminal.

## 2) Crear repo local y subir a GitHub
Desde la carpeta del proyecto:

```bash
git init
git branch -M main
git add .
git commit -m "Initial NovaWash web app"
```

Crea un repositorio vacío en GitHub (por ejemplo `novawash-web`) y luego ejecuta:

```bash
git remote add origin https://github.com/TU_USUARIO/novawash-web.git
git push -u origin main
```

## 3) Crear credenciales FTP en Hostinger
En hPanel:
- Ve a **Hosting** -> tu dominio -> **FTP Accounts**.
- Crea (o usa) una cuenta FTP y copia:
  - Host FTP (ej: `ftp.tudominio.com` o IP)
  - Usuario FTP
  - Contraseña FTP
  - Puerto (normalmente 21)

## 4) Configurar Secrets en GitHub
En tu repositorio GitHub:
- **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**

Crea estos secretos:
- `HOSTINGER_FTP_SERVER`
- `HOSTINGER_FTP_USERNAME`
- `HOSTINGER_FTP_PASSWORD`
- `HOSTINGER_FTP_PORT` (por ejemplo `21`)

## 5) Activar deploy automático
El workflow ya está en:
- `.github/workflows/deploy-hostinger.yml`

Cada vez que hagas `git push` a `main`, GitHub publicará en `/public_html/`.

## 6) Flujo diario de trabajo
Cuando edites desde aquí:

```bash
git add .
git commit -m "cambios"
git push
```

Luego verifica en:
- `https://tudominio.com`

## Notas
- Mantén SSL activo en Hostinger para que el lector QR funcione en móvil.
- Si usas Google Apps Script, el frontend seguirá funcionando después del deploy porque la URL API está en `script.js`.
