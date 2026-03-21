import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/react-router";
import styles from "./Header.module.css";

export default function Header() {
  return (
    <header>
      <h1>URL Shortener + QR Code Generator</h1>
      <SignedOut>
        <SignInButton>
          <button className={styles.signInButton}>Sign In</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: {
                width: "40px",
                height: "40px",
              },
            },
          }}
        />
      </SignedIn>
    </header>
  );
}
