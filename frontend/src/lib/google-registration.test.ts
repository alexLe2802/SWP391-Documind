import {
  clearPendingGoogleRegistration,
  readPendingGoogleRegistration,
  storePendingGoogleRegistration,
} from "./google-registration";

describe("pending Google registration", () => {
  afterEach(() => {
    clearPendingGoogleRegistration();
  });

  it("restores the Google profile across a route remount", () => {
    const profile = {
      fullName: "Nguyễn Văn An",
      email: "an@example.com",
      avatarUrl: "https://example.com/avatar.png",
    };

    storePendingGoogleRegistration(profile);

    expect(readPendingGoogleRegistration()).toEqual(profile);
  });

  it("discards invalid stored data", () => {
    window.sessionStorage.setItem(
      "documind:pending-google-registration",
      JSON.stringify({ fullName: "Missing email" }),
    );

    expect(readPendingGoogleRegistration()).toBeNull();
  });
});
