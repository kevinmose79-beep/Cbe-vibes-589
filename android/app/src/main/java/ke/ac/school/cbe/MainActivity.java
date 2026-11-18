package ke.ac.school.cbe;

import android.os.Bundle;
import android.os.SystemClock;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final long MAX_SPLASH_TIMEOUT_MS = 4000L;
    private long launchTimeMs;
    private volatile boolean isAppReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        launchTimeMs = SystemClock.elapsedRealtime();
        isAppReady = false;

        splashScreen.setKeepOnScreenCondition(() -> {
            long elapsed = SystemClock.elapsedRealtime() - launchTimeMs;
            if (elapsed >= MAX_SPLASH_TIMEOUT_MS) {
                return false;
            }
            return !isAppReady;
        });

        registerPlugin(AppStartupPlugin.class);
        registerPlugin(SecureStoragePlugin.class);
        registerPlugin(BiometricPlugin.class);

        super.onCreate(savedInstanceState);
    }

    public void setAppReady(boolean ready) {
        this.isAppReady = ready;
    }

    public boolean isAppReady() {
        return this.isAppReady;
    }
}
