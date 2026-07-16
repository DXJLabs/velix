export function homeScreenMarkup() {
  return `
        <section class="screen unlock-screen" data-screen="unlock">
          <div class="home-frame">
            <header class="home-nav" aria-label="VEIL home navigation">
              <div class="brand-row" aria-label="VEIL">
                <div class="brand-mark">V</div>
                <strong>VEIL</strong>
              </div>
              <nav class="home-nav-links" aria-label="Product sections">
                <a href="#home-features">Features</a>
                <a href="#home-protocol-heading">Protocol</a>
                <a href="#home-resources-heading">Resources</a>
                <a href="#home-community-heading">Community</a>
              </nav>
              <button class="home-nav-action" type="button" data-connect-wallet>
                <i data-lucide="wallet-cards" class="size-4"></i>
                <span data-wallet-label>Connect Wallet</span>
              </button>
              <button class="home-menu-button" type="button" aria-label="Open menu" aria-expanded="false" data-home-menu-toggle>
                <i data-lucide="menu" class="size-5"></i>
              </button>
              <div class="home-menu-panel" data-home-menu-panel hidden>
                <a href="#" data-home-link="docs">Documentation</a>
                <a href="#" data-home-link="github">GitHub</a>
                <a href="#" data-home-link="x">X (Twitter)</a>
                <a href="#" data-home-link="community">Discord / Telegram</a>
                <a href="#" data-home-link="changelog">Changelog</a>
                <a href="#" data-home-link="issues">Report Issue</a>
                <a href="#" data-home-link="privacy">Privacy Policy</a>
                <a href="#" data-home-link="terms">Terms of Service</a>
              </div>
            </header>

            <div class="unlock-layout">
              <div class="unlock-copy">
                <p class="home-label">VEIL</p>
                <h1>Private Deal Workspace</h1>
                <p class="home-kicker">Pre-production privacy architecture on Starknet Sepolia.</p>
                <p class="home-description">Direct encrypted messaging is the fallback path. Private payments, offers, escrow, claims, and settlement remain disabled until their live E2E gates pass.</p>
                <div class="unlock-actions">
                  <button class="primary-action" type="button" data-connect-wallet>
                    <i data-lucide="wallet-cards" class="size-5"></i>
                    <span data-wallet-label>Connect Wallet</span>
                  </button>
                </div>
                <p class="home-trust-line">
                  <i data-lucide="shield-check" class="size-4"></i>
                  Privacy Pool integration blocked on a screening-capable deployment
                </p>
              </div>

              <div class="home-visual" aria-hidden="true">
                <div class="visual-card visual-chat">
                  <i data-lucide="network" class="size-5"></i>
                </div>
                <div class="visual-card visual-proof">
                  <i data-lucide="file-check-2" class="size-5"></i>
                </div>
                <div class="visual-card visual-user">
                  <i data-lucide="user-round" class="size-5"></i>
                </div>
                <div class="visual-lock">
                  <i data-lucide="lock-keyhole" class="size-12"></i>
                </div>
                <div class="visual-shadow"></div>
              </div>
            </div>

            <div id="home-features" class="home-capabilities" aria-label="Product capabilities">
              <article class="capability-card">
              <span class="capability-icon"><i data-lucide="network" class="size-5"></i></span>
              <h2>Encrypted Channels</h2>
              <p>Direct encrypted fallback only; recipient bootstrap and live delivery still require verification.</p>
              </article>
              <article class="capability-card">
              <span class="capability-icon"><i data-lucide="shield" class="size-5"></i></span>
              <h2>Private Financial Flows</h2>
              <p>Blocked until a compatible Pool, prover, discovery route, deployments, and two-account E2E are available.</p>
              </article>
              <article class="capability-card">
              <span class="capability-icon"><i data-lucide="badge-check" class="size-5"></i></span>
              <h2>Honest Evidence</h2>
              <p>Only real confirmed transaction hashes receive explorer links; VEIL does not fabricate proofs or success states.</p>
              </article>
            </div>

            <aside class="home-network-panel" aria-labelledby="home-protocol-heading">
              <h2 id="home-protocol-heading">Protocol</h2>
              <div class="home-network-list">
                <div>
                  <span>Network</span>
                  <strong id="home-network">Starknet Sepolia</strong>
                </div>
                <div>
                  <span>Privacy Pool</span>
                  <strong id="home-privacy-pool">Legacy — Shield blocked</strong>
                </div>
                <div>
                  <span>Helper Contract</span>
                  <strong id="home-helper-contract">Unverified</strong>
                </div>
                <div>
                  <span>Environment</span>
                  <strong id="home-environment">Testnet</strong>
                </div>
              </div>
            </aside>

            <section class="home-resource-section" aria-labelledby="home-resources-heading">
              <div class="home-section-heading">
                <p class="home-label">Resources</p>
                <h2 id="home-resources-heading">Official VEIL links</h2>
              </div>
              <div class="home-resource-grid">
                <a href="#" data-home-link="docs"><i data-lucide="book-open" class="size-5"></i><span>Documentation</span></a>
                <a href="#" data-home-link="github"><i data-lucide="code-2" class="size-5"></i><span>GitHub</span></a>
                <a href="#" data-home-link="x"><i data-lucide="at-sign" class="size-5"></i><span>X (Twitter)</span></a>
                <a href="#" data-home-link="community"><i data-lucide="messages-square" class="size-5"></i><span>Telegram / Discord</span></a>
              </div>
            </section>

            <section class="home-community-section" aria-labelledby="home-community-heading">
              <div>
                <p class="home-label">Community</p>
                <h2 id="home-community-heading">Follow development</h2>
              </div>
              <div class="home-community-actions">
                <a href="#" data-home-link="x">Latest updates</a>
                <a href="#" data-home-link="issues">Report issues</a>
                <a href="#" data-home-link="github">Contribute</a>
              </div>
            </section>

            <footer class="home-footer">
              <strong>VEIL</strong>
              <span>Version v0.1.0</span>
              <span>Starknet Sepolia pre-production build</span>
              <a href="#" data-home-link="privacy">Privacy Policy</a>
              <a href="#" data-home-link="terms">Terms</a>
              <a href="#" data-home-link="license">License</a>
            </footer>
          </div>
        </section>

`;
}

