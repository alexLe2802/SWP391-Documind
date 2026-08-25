param(
  [string]$OutputPath = "docs/payment-api-spec.xlsx"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$fullOutputPath = Join-Path $root $OutputPath
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("payment-api-spec-" + [System.Guid]::NewGuid().ToString("N"))

function XmlEscape([object]$value) {
  if ($null -eq $value) { return "" }
  return [System.Security.SecurityElement]::Escape([string]$value)
}

function WriteUtf8([string]$Path, [string]$Value) {
  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.Encoding]::UTF8)
}

function ColumnName([int]$index) {
  $name = ""
  while ($index -gt 0) {
    $index--
    $name = [char](65 + ($index % 26)) + $name
    $index = [math]::Floor($index / 26)
  }
  return $name
}

function WriteWorksheet([string]$Path, [object[][]]$Rows) {
  $sheetData = New-Object System.Text.StringBuilder
  for ($rowIndex = 0; $rowIndex -lt $Rows.Count; $rowIndex++) {
    $excelRow = $rowIndex + 1
    [void]$sheetData.Append("<row r=`"$excelRow`">")
    for ($colIndex = 0; $colIndex -lt $Rows[$rowIndex].Count; $colIndex++) {
      $ref = (ColumnName ($colIndex + 1)) + $excelRow
      $value = XmlEscape $Rows[$rowIndex][$colIndex]
      [void]$sheetData.Append("<c r=`"$ref`" t=`"inlineStr`"><is><t>$value</t></is></c>")
    }
    [void]$sheetData.Append("</row>")
  }

  $xml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/>
    <col min="4" max="4" width="50" customWidth="1"/>
    <col min="5" max="8" width="32" customWidth="1"/>
  </cols>
  <sheetData>$sheetData</sheetData>
</worksheet>
"@
  WriteUtf8 $Path $xml
}

$overviewRows = @(
  @("Field", "Value"),
  @("Contract", "Payment API"),
  @("Updated", "2026-06-24"),
  @("Base path", "/api"),
  @("User auth", "Authorization: Bearer <Firebase ID token>"),
  @("Webhook auth", "Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>"),
  @("Display prices", "STUDENT 149000 VND; PRO 349000 VND"),
  @("Test checkout amounts", "STUDENT 5000 VND; PRO 10000 VND"),
  @("Student to Pro upgrade", "Charges checkout difference only: 5000 VND"),
  @("Pending checkout TTL", "2 minutes; repeated same-plan checkout reuses the pending session"),
  @("Free plan rule", "No manual switch API; system returns to FREE only on expiry/refund")
)

$endpointRows = @(
  @("Method", "Path", "Auth", "Success", "Errors", "Notes"),
  @("GET", "/subscription/plans", "Bearer", "200 ApiEnvelope<SubscriptionPlanDto[]>", "401", "Returns display prices, not checkout test amounts"),
  @("GET", "/subscription/current", "Bearer", "200 ApiEnvelope<CurrentSubscriptionDto>", "401", "Expired paid subscription is switched to FREE before response"),
  @("POST", "/payments/checkout", "Bearer", "200 ApiEnvelope<CheckoutResponseDto>", "400, 401, 409, 503", "Creates or resumes a 2-minute SePay checkout; FREE is rejected"),
  @("GET", "/payments/history", "Bearer", "200 ApiEnvelope<PaymentOrderDto[]>", "401", "Latest 20 orders; expired pending orders are marked EXPIRED"),
  @("GET", "/payments/{invoiceNumber}", "Bearer", "200 ApiEnvelope<PaymentOrderDto>", "400, 401, 404", "Pending order can reconcile against SePay and activate subscription"),
  @("POST", "/payments/{invoiceNumber}/status", "Bearer", "200 ApiEnvelope<PaymentOrderDto>", "400, 401, 404, 409", "Only FAILED or CANCELLED accepted; PAID cannot be changed"),
  @("POST", "/payments/sepay/ipn", "Apikey", "200 {success:true}", "400, 401, 403, 404, 409", "Receives SePay PG IPN and bank transfer webhook")
)

$scenarioRows = @(
  @("Scenario", "Input", "Expected amount", "Expected result"),
  @("New Student checkout", "plan=STUDENT, method=BANK_TRANSFER/CARD", "5000", "PaymentOrder PENDING, SePay fields order_amount=5000"),
  @("New Pro checkout", "plan=PRO, method=BANK_TRANSFER/CARD", "10000", "PaymentOrder PENDING, SePay fields order_amount=10000"),
  @("Student upgrades to Pro", "active=STUDENT, requested=PRO", "5000", "Charges missing test amount difference and keeps existing expiry after paid"),
  @("Pro attempts Student", "active=PRO, requested=STUDENT", "N/A", "409 Conflict; frontend hides downgrade action"),
  @("Duplicate pending checkout", "same user + same plan within 2 minutes", "existing order amount", "Returns existing checkout session instead of duplicate-order error"),
  @("Payment success redirect", "payment=success&invoice=...", "N/A", "Frontend polls GET /payments/{invoice}; backend reconciles/returns PAID when confirmed"),
  @("Expired paid subscription", "expiresAt <= now", "N/A", "GET /subscription/current activates FREE")
)

$responseRows = @(
  @("Code", "Endpoint group", "Meaning"),
  @("200", "All payment read/write success", "Wrapped success envelope except webhook raw {success:true}"),
  @("400", "Checkout/status/payment/webhook", "Invalid body, FREE checkout, unsupported payload, amount/order mismatch"),
  @("401", "Protected endpoints/webhook", "Missing or invalid Firebase token or SePay API key"),
  @("403", "Webhook", "SePay notification is not approved"),
  @("404", "Payment lookup/status/webhook", "Order not found or does not belong to current user"),
  @("409", "Checkout/status/webhook", "Already active plan, downgrade, paid order mutation, duplicated transaction"),
  @("503", "Checkout", "SePay gateway is not configured")
)

New-Item -ItemType Directory -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "_rels") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "docProps") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "xl") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "xl\_rels") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "xl\worksheets") | Out-Null

WriteUtf8 (Join-Path $tempRoot "[Content_Types].xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"@

WriteUtf8 (Join-Path $tempRoot "_rels\.rels") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

WriteUtf8 (Join-Path $tempRoot "docProps\core.xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Payment API Spec</dc:title>
  <dc:creator>Codex</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-06-24T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-06-24T00:00:00Z</dcterms:modified>
</cp:coreProperties>
"@

WriteUtf8 (Join-Path $tempRoot "docProps\app.xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>DocuMind API Spec</Application>
</Properties>
"@

WriteUtf8 (Join-Path $tempRoot "xl\workbook.xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Overview" sheetId="1" r:id="rId1"/>
    <sheet name="Endpoints" sheetId="2" r:id="rId2"/>
    <sheet name="Scenarios" sheetId="3" r:id="rId3"/>
    <sheet name="Responses" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>
"@

WriteUtf8 (Join-Path $tempRoot "xl\_rels\workbook.xml.rels") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"@

WriteUtf8 (Join-Path $tempRoot "xl\styles.xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>
"@

WriteWorksheet (Join-Path $tempRoot "xl\worksheets\sheet1.xml") $overviewRows
WriteWorksheet (Join-Path $tempRoot "xl\worksheets\sheet2.xml") $endpointRows
WriteWorksheet (Join-Path $tempRoot "xl\worksheets\sheet3.xml") $scenarioRows
WriteWorksheet (Join-Path $tempRoot "xl\worksheets\sheet4.xml") $responseRows

if (Test-Path $fullOutputPath) {
  Remove-Item -LiteralPath $fullOutputPath
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempRoot, $fullOutputPath)
Remove-Item -LiteralPath $tempRoot -Recurse -Force

Write-Host "Created $fullOutputPath"
