#!/usr/bin/env bash
# Vetra V2 deploy script
# Usage: fill PRIVATE_KEY in .env then run: bash deploy-v2.sh

set -euo pipefail

# Load .env
set -a; source "$(dirname "$0")/.env"; set +a

RITUAL_RPC="https://rpc.ritualfoundation.org"
RITUAL_WALLET="0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948"

echo "==> Building VetraConsumer V2..."
forge build

echo "==> Deploying to Ritual Testnet (chain 1979)..."
DEPLOY_OUT=$(forge script script/Deploy.s.sol \
  --rpc-url "$RITUAL_RPC" \
  --broadcast \
  --private-key "$PRIVATE_KEY" \
  2>&1)

echo "$DEPLOY_OUT"

# Extract deployed address from forge output
NEW_ADDR=$(echo "$DEPLOY_OUT" | grep -oP 'VetraConsumer deployed at: \K0x[0-9a-fA-F]{40}')

if [ -z "$NEW_ADDR" ]; then
  echo "ERROR: Could not parse deployed address. Check output above."
  exit 1
fi

echo ""
echo "==> Deployed: $NEW_ADDR"

echo "==> Depositing 0.004 RITUAL into RitualWallet for VetraConsumer..."
cast send "$RITUAL_WALLET" \
  "depositFor(address,uint256)" \
  "$NEW_ADDR" 3000000 \
  --value 0.004ether \
  --rpc-url "$RITUAL_RPC" \
  --private-key "$PRIVATE_KEY"

echo "==> Updating frontend/.env.local..."
FRONTEND_ENV="$(dirname "$0")/../frontend/.env.local"
if grep -q "NEXT_PUBLIC_VETRA_ADDRESS" "$FRONTEND_ENV"; then
  sed -i "s|NEXT_PUBLIC_VETRA_ADDRESS=.*|NEXT_PUBLIC_VETRA_ADDRESS=$NEW_ADDR|" "$FRONTEND_ENV"
else
  echo "NEXT_PUBLIC_VETRA_ADDRESS=$NEW_ADDR" >> "$FRONTEND_ENV"
fi

echo ""
echo "======================================================"
echo " V2 deployment complete!"
echo " Contract : $NEW_ADDR"
echo " Explorer : https://explorer.ritualfoundation.org/address/$NEW_ADDR"
echo " Next step: restart the frontend (npm run dev)"
echo "======================================================"
