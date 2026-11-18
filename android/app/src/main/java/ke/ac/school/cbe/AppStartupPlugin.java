package ke.ac.school.cbe;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppStartup")
public class AppStartupPlugin extends Plugin {

    @PluginMethod
    public void notifyAppReady(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).setAppReady(true);
        }
        call.resolve();
    }
}
