import { test, expect } from "@playwright/test";

test("guided walkthrough, human approval, failure recovery, verification and report", async ({
  page,
  request,
}) => {
  await request.post("/api/reset", { data: { confirmed: true } });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clean slate. A clear record." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "Start erasure request" }).click();
  await page.getByTestId("candidate-subject-alex-customer").click();
  await page
    .getByRole("checkbox", { name: "I confirm this identity for the demo." })
    .check();
  await page
    .getByRole("button", { name: "Confirm identity", exact: true })
    .click();
  await page.getByRole("button", { name: "Discover & classify" }).click();
  await expect(
    page.getByRole("heading", { name: "Your proposed action plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & approve" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/review-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/review-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  const state = await (await request.get("/api/state")).json();
  const caseId = state.activeCase.id;
  const unauthorizedExecution = await request.post(
    `/api/cases/${caseId}/actions`,
    { data: { type: "execute", simulateFailure: false } },
  );
  expect(unauthorizedExecution.status()).toBe(409);
  const protectedEdit = await request.post(`/api/cases/${caseId}/actions`, {
    data: {
      type: "edit",
      findingId: "gmail-invoice",
      action: "delete",
      reason: "Attempted policy bypass.",
    },
  });
  expect(protectedEdit.status()).toBe(409);
  const customerTitle = "Alex Morgan · customer contact";
  for (const verdict of ["Redact", "Retain", "Delete"] as const) {
    await page
      .getByRole("button", {
        name: `Review verdict for ${customerTitle}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    for (const option of ["Delete", "Redact", "Retain"]) {
      await expect(
        dialog.getByRole("radio", { name: option, exact: true }),
      ).toBeVisible();
    }
    await dialog.getByRole("radio", { name: verdict, exact: true }).check();
    await expect(
      dialog.getByRole("button", { name: "Save review decision" }),
    ).toBeDisabled();
    if (verdict === "Redact") {
      await expect(dialog.getByText("EXACT REDACTION PREVIEW")).toBeVisible();
      await expect(dialog.locator(".after-preview")).toContainText(
        "[redacted]",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        dialog.getByRole("radio", { name: "Retain", exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: "test-results/verdict-mobile.png" });
      await page.setViewportSize({ width: 1440, height: 1100 });
    } else if (verdict === "Retain") {
      await expect(
        dialog.getByText("The source record will be preserved."),
      ).toBeVisible();
      await expect(dialog.locator(".after-preview")).toHaveCount(0);
    } else {
      await expect(
        dialog.getByText("The whole synthetic record will be deleted."),
      ).toBeVisible();
    }
    await dialog
      .getByLabel("Reason for your decision")
      .fill(
        `Reviewer chose ${verdict.toLowerCase()} for this synthetic customer record.`,
      );
    await dialog.getByRole("button", { name: "Save review decision" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Review verdict for ${customerTitle}`,
        exact: true,
      }),
    ).toHaveText(verdict);
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: `Review verdict for ${customerTitle}`,
        exact: true,
      }),
    ).toHaveText(verdict);
  }
  await page
    .getByRole("button", {
      name: "Review Customer research · Q3 synthesis",
      exact: true,
    })
    .click();
  await expect(page.getByText("EXACT REDACTION PREVIEW")).toBeVisible();
  await page.screenshot({ path: "test-results/redaction-drawer.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const title of [
    "Alex Morgan · partner contact",
    "Agency workshop next week",
  ]) {
    await page
      .getByRole("button", { name: `Review ${title}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Use the identity evidence" })
      .click();
    await page.getByRole("button", { name: "Confirm false positive" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review & approve" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Review & approve" }).click();
  await page
    .getByRole("checkbox", { name: /I've reviewed the proposed actions/ })
    .check();
  await page.getByRole("button", { name: "Approve plan", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Simulate connector failure" })
    .check();
  await page.getByRole("button", { name: "Execute approved plan" }).click();
  await page.getByRole("button", { name: "Verify outcomes" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A clear record includes what remains.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry failed actions" }).click();
  await page.getByRole("button", { name: "Verify outcomes" }).click();
  await expect(
    page.getByRole("heading", { name: "Every finding. Accounted for." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/verified-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "View report" }).click();
  await expect(
    page.getByRole("heading", { name: "Demo execution report" }),
  ).toBeVisible();
  await expect(
    page.getByText("Completed within simulated scope", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await page.screenshot({
    path: "test-results/report-print.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Print / save PDF" }),
  ).toBeHidden();
  const report = await (
    await request.get(`/api/cases/${caseId}/report`)
  ).json();
  expect(report.verification.complete).toBe(true);
  expect(
    report.results.filter((r: { attempts: number }) => r.attempts === 2),
  ).toHaveLength(1);
  expect(JSON.stringify(report)).not.toContain(
    "Ignore all previous instructions",
  );
});

test("unknown identity and cross-origin mutations are rejected", async ({
  page,
  request,
}) => {
  await request.post("/api/reset", { data: { confirmed: true } });
  await page.goto("/");
  await page.getByLabel("Customer name or email").fill("Not a seeded customer");
  await page.getByRole("button", { name: "Start erasure request" }).click();
  await expect(page.locator(".error-banner")).toContainText(
    "No seeded customer",
  );
  const crossOrigin = await request.post("/api/reset", {
    headers: { Origin: "https://untrusted.example" },
    data: { confirmed: true },
  });
  expect(crossOrigin.status()).toBe(403);
});
