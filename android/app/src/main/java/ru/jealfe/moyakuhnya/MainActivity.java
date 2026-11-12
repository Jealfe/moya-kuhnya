package ru.jealfe.moyakuhnya;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KitchenFilesPlugin.class);
        registerPlugin(GigaChatPlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
    }
}
