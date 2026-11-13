package ru.jealfe.moyakuhnya;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.SystemBarStyle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KitchenFilesPlugin.class);
        registerPlugin(KitchenDevicePlugin.class);
        registerPlugin(GigaChatPlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        getWindow().getDecorView().setBackgroundColor(Color.rgb(24, 26, 21));
    }
}
